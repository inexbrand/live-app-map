/**
 * Невидимый хост снимков, замечаний и моста к агенту (монтируется в shell один раз).
 * - ведёт сессию снимка экрана (поток вкладки → кадр → результат);
 * - публикует агенту состояние визуализатора, принимает его просьбы снимка;
 * - замечания: синхронизация веток и выбор компонента в живых экранах;
 * - клавиши фокуса экрана: C — выбор компонента, I — работа с приложением,
 *   W — замечание к экрану, [ и ] — соседний экран, ⇧C — все замечания,
 *   ⌥⇧S — замечание по выделенной области выбранного экрана.
 */
import { useEffect } from 'react';
import { useCommentPicker, useCommentsSync } from '../lib/comments/use-comments';
import { useSnapshotSession } from '../lib/snapshot/use-snapshot-session';
import { useAgentBridge } from '../lib/use-agent-bridge';
import { useAppStore } from '../store/app-store';
import { useCommentsStore } from '../store/comments-store';
import { isTypingTarget } from '../lib/typing-target';
import { useSnapshotStore } from '../store/snapshot-store';
import { commentOnScreen, goNeighbor, setFocusMode, startRegionComment } from './comments/start-comment';

/** Действия по коду клавиши (раскладка не важна); ⇧ — только у ⇧C. */
const FOCUS_KEYS: ReadonlyMap<string, () => void> = new Map([
  ['KeyC', () => setFocusMode('pick')],
  ['KeyI', () => setFocusMode('interact')],
  ['KeyW', () => commentOnScreen()],
  ['BracketLeft', () => goNeighbor(-1)],
  ['BracketRight', () => goNeighbor(1)],
]);

/**
 * Esc у карты — шаг назад: окно замечания, затем лист, затем фокус экрана.
 * Esc, который уже обработало поле, лист или слой снимка, сюда не доходит (defaultPrevented).
 */
function stepBack(): void {
  if (useSnapshotStore.getState().session.phase !== 'idle') {
    return;
  }
  const c = useCommentsStore.getState();
  if (c.target !== null) {
    c.closeTarget();
  } else if (c.sheetOpen) {
    c.closeSheet();
  } else {
    useAppStore.getState().selectPage(null);
  }
}

/** ⇧C — лист замечаний; остальные — у выбранного экрана. */
function commentKey(e: KeyboardEvent): void {
  if (e.altKey || isTypingTarget(e.target)) {
    return;
  }
  if (e.key === 'Escape' && !e.shiftKey && !e.defaultPrevented) {
    stepBack();
    return;
  }
  if (e.shiftKey && e.code === 'KeyC') {
    e.preventDefault();
    const c = useCommentsStore.getState();
    if (c.sheetOpen) {
      c.closeSheet();
    } else {
      c.openSheet(null);
    }
    return;
  }
  const act = e.shiftKey ? undefined : FOCUS_KEYS.get(e.code);
  if (act !== undefined && useAppStore.getState().selectedPageId !== null) {
    e.preventDefault();
    act();
  }
}

/** Клавиши замечаний; без карты и с ⌘/Ctrl не работают. */
function onGrabKey(e: KeyboardEvent): void {
  if (useAppStore.getState().document === null || e.metaKey || e.ctrlKey) {
    return;
  }
  if (e.altKey && e.shiftKey && e.code === 'KeyS') {
    e.preventDefault();
    startRegionComment();
    return;
  }
  commentKey(e);
}

/**
 * Хост снимков и замечаний; ничего не рисует.
 */
export function LamGrabHost() {
  useSnapshotSession();
  useAgentBridge();
  useCommentsSync();
  useCommentPicker();

  useEffect(() => {
    window.addEventListener('keydown', onGrabKey);
    return () => window.removeEventListener('keydown', onGrabKey);
  }, []);

  return null;
}
