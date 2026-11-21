/**
 * Невидимый хост снимков, замечаний и моста к агенту (монтируется в shell один раз).
 * - ведёт сессию снимка экрана (поток вкладки → кадр → результат);
 * - публикует агенту состояние визуализатора, принимает его просьбы снимка;
 * - замечания: синхронизация веток и выбор компонента в живых экранах;
 * - клавиши: C — замечание к компоненту, ⇧C — все замечания,
 *   ⌥⇧S — замечание по выделенной области выбранного экрана.
 */
import { useEffect } from 'react';
import { useCommentPicker, useCommentsSync } from '../lib/comments/use-comments';
import { useSnapshotSession } from '../lib/snapshot/use-snapshot-session';
import { useAgentBridge } from '../lib/use-agent-bridge';
import { useAppStore } from '../store/app-store';
import { useCommentsStore } from '../store/comments-store';
import { startComment } from './comments/start-comment';

/** Фокус в поле ввода: буквы принадлежат полю. */
function typing(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);
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
    const onKey = (e: KeyboardEvent): void => {
      if (useAppStore.getState().document === null || e.metaKey || e.ctrlKey) {
        return;
      }
      if (e.altKey && e.shiftKey && e.code === 'KeyS') {
        e.preventDefault();
        startComment('region');
        return;
      }
      if (e.altKey || e.code !== 'KeyC' || typing(e.target)) {
        return;
      }
      e.preventDefault();
      if (e.shiftKey) {
        const c = useCommentsStore.getState();
        c.setListOpen(!c.listOpen);
        return;
      }
      startComment('element');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return null;
}
