/**
 * Ведёт сессию снимка: открывает поток вкладки, снимает выделенную
 * область, отдаёт результат замечанию или агенту, закрывает поток.
 * Единственный владелец TabGrabber — LamGrabHost.
 */
import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/app-store';
import { useSnapshotStore, type SnapshotPurpose } from '../../store/snapshot-store';
import { uploadSnapshot } from '../agent-bridge';
import { useCommentsStore } from '../../store/comments-store';
import { anchorPage, screenAnchor } from '../comments/page-anchor';
import { createTabGrabber, type GrabResult, type OpenResult, type TabGrabber } from './tab-grabber';

/** Сколько держать поток вкладки после замечания: следующее — без диалога браузера. */
const KEEP_STREAM_MS = 5 * 60_000;

/** Ждём два кадра: оверлей выделения должен исчезнуть из кадра. */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** Снимок области для замечания: окно замечания к экрану целиком со снимком. */
function deliverComment(purpose: Extract<SnapshotPurpose, { kind: 'comment' }>, shot: GrabResult): string | null {
  const page = purpose.pageId === null ? null : anchorPage(purpose.pageId);
  if (page === null) {
    return 'Выберите экран, к которому относится область';
  }
  useAppStore.getState().selectPage(page.id);
  useCommentsStore.getState().openTarget({ anchor: screenAnchor(page), frame: null, shot: shot.ok ? shot.dataUrl : null });
  return shot.ok ? null : `Снимок не удался: ${shot.error}`;
}

async function deliver(purpose: SnapshotPurpose, shot: GrabResult): Promise<string | null> {
  if (purpose.kind === 'comment') {
    return deliverComment(purpose, shot);
  }
  if (!shot.ok) {
    return `Снимок не удался: ${shot.error}`;
  }
  const up = await uploadSnapshot({
    requestId: purpose.requestId,
    pageId: useAppStore.getState().selectedPageId,
    dataUrl: shot.dataUrl,
  });
  return up.ok ? `Снимок отправлен агенту: ${up.file}` : `Снимок не отправлен агенту: ${up.error}`;
}

type Session = ReturnType<typeof useSnapshotStore.getState>['session'];
type KeepRef = { current: number };

/** Сессии нет: поток живёт до конца срока после замечания, потом закрывается. */
function idlePhase(grabber: TabGrabber, keepUntil: KeepRef): (() => void) | undefined {
  const left = keepUntil.current - Date.now();
  if (left <= 0) {
    grabber.close();
    return undefined;
  }
  const t = window.setTimeout(() => grabber.close(), left);
  return () => window.clearTimeout(t);
}

/** Доступ к вкладке получен или нет: выделение, замечание без снимка или отмена. */
function onOpened(res: OpenResult): void {
  const store = useSnapshotStore.getState();
  const toast = useAppStore.getState().setToast;
  if (res.ok) {
    store.opened();
  } else {
    store.cancel();
    toast(`Снимок: ${res.error}`);
  }
}

/** Просим доступ к вкладке. */
function openingPhase(grabber: TabGrabber, session: Extract<Session, { phase: 'opening' }>): void {
  void grabber.open().then((res) => {
    if (useSnapshotStore.getState().session !== session) {
      // Отменили, пока браузер спрашивал разрешение: поток не нужен
      grabber.close();
      return;
    }
    onOpened(res);
  });
}

/** Снимаем область и отдаём результат; поток замечания держим для следующего. */
function capturingPhase(grabber: TabGrabber, session: Extract<Session, { phase: 'capturing' }>, keepUntil: KeepRef): void {
  void afterPaint()
    .then(() => grabber.grab(session.rect))
    .then((shot) => {
      if (session.purpose.kind === 'comment') {
        keepUntil.current = Date.now() + KEEP_STREAM_MS;
      } else {
        grabber.close();
      }
      return deliver(session.purpose, shot);
    })
    .then((message) => {
      if (message !== null) {
        useAppStore.getState().setToast(message);
      }
      useSnapshotStore.getState().finish();
    });
}

/** Шаг сессии по её фазе; выделение ведёт оверлей. */
function stepSession(grabber: TabGrabber, session: Session, keepUntil: KeepRef): (() => void) | undefined {
  switch (session.phase) {
    case 'idle':
    case 'requested':
      return idlePhase(grabber, keepUntil);
    case 'opening':
      openingPhase(grabber, session);
      return undefined;
    case 'capturing':
      capturingPhase(grabber, session, keepUntil);
      return undefined;
    case 'selecting':
      return undefined;
  }
}

/**
 * Подключает сессию снимка к браузерному захвату вкладки.
 */
export function useSnapshotSession(): void {
  const session = useSnapshotStore((s) => s.session);
  const hasMap = useAppStore((s) => s.document !== null);
  const grabberRef = useRef<TabGrabber | null>(null);
  const keepUntil = useRef(0);

  useEffect(() => {
    // Карту закрыли посреди выделения — оверлея больше нет, сессию отменяем
    if (!hasMap) {
      useSnapshotStore.getState().cancel();
    }
  }, [hasMap]);

  useEffect(() => {
    grabberRef.current ??= createTabGrabber();
    return stepSession(grabberRef.current, session, keepUntil);
  }, [session]);

  useEffect(() => () => grabberRef.current?.close(), []);
}
