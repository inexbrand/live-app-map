/**
 * Ведёт сессию снимка: открывает поток вкладки, снимает выделенную
 * область, отдаёт результат замечанию или агенту, закрывает поток.
 * Единственный владелец TabGrabber — LamGrabHost.
 */
import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/app-store';
import { useSnapshotStore, type SnapshotPurpose } from '../../store/snapshot-store';
import { uploadSnapshot } from '../agent-bridge';
import { createTabGrabber, type GrabResult, type TabGrabber } from './tab-grabber';

/** Ждём два кадра: оверлей выделения должен исчезнуть из кадра. */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

async function deliver(purpose: SnapshotPurpose, shot: GrabResult): Promise<string> {
  if (!shot.ok) {
    return `Снимок не удался: ${shot.error}`;
  }
  if (purpose.kind === 'feedback') {
    useSnapshotStore.getState().setFeedbackShot({ dataUrl: shot.dataUrl, pageId: purpose.pageId });
    return `Снимок ${shot.width}×${shot.height} добавлен к замечанию`;
  }
  const up = await uploadSnapshot({
    requestId: purpose.requestId,
    pageId: useAppStore.getState().selectedPageId,
    dataUrl: shot.dataUrl,
  });
  return up.ok ? `Снимок отправлен агенту: ${up.file}` : `Снимок не отправлен агенту: ${up.error}`;
}

/**
 * Подключает сессию снимка к браузерному захвату вкладки.
 */
export function useSnapshotSession(): void {
  const session = useSnapshotStore((s) => s.session);
  const hasMap = useAppStore((s) => s.document !== null);
  const grabberRef = useRef<TabGrabber | null>(null);

  useEffect(() => {
    // Карту закрыли посреди выделения — оверлея больше нет, сессию отменяем
    if (!hasMap) {
      useSnapshotStore.getState().cancel();
    }
  }, [hasMap]);

  useEffect(() => {
    grabberRef.current ??= createTabGrabber();
    const grabber = grabberRef.current;
    const store = useSnapshotStore.getState();
    const toast = useAppStore.getState().setToast;

    if (session.phase === 'idle' || session.phase === 'requested') {
      grabber.close();
      return;
    }
    if (session.phase === 'opening') {
      void grabber.open().then((res) => {
        if (useSnapshotStore.getState().session !== session) {
          // Отменили, пока браузер спрашивал разрешение: поток не нужен
          grabber.close();
          return;
        }
        if (res.ok) {
          store.opened();
        } else {
          store.cancel();
          toast(`Снимок: ${res.error}`);
        }
      });
      return;
    }
    if (session.phase === 'capturing') {
      void afterPaint()
        .then(() => grabber.grab(session.rect))
        .then((shot) => {
          grabber.close();
          return deliver(session.purpose, shot);
        })
        .then((message) => {
          toast(message);
          useSnapshotStore.getState().finish();
        });
    }
  }, [session]);

  useEffect(() => () => grabberRef.current?.close(), []);
}
