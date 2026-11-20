/**
 * Невидимый хост снимков и моста к агенту (монтируется в shell один раз).
 * - ведёт сессию снимка экрана (поток вкладки → кадр → результат);
 * - публикует агенту состояние визуализатора, принимает его просьбы снимка;
 * - Alt+Shift+S — снимок области для замечания по выбранному экрану.
 */
import { useEffect } from 'react';
import { useSnapshotSession } from '../lib/snapshot/use-snapshot-session';
import { useAgentBridge } from '../lib/use-agent-bridge';
import { useAppStore } from '../store/app-store';
import { useSnapshotStore } from '../store/snapshot-store';

/**
 * Хост снимков; ничего не рисует.
 */
export function LamGrabHost() {
  useSnapshotSession();
  useAgentBridge();

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.altKey || !e.shiftKey || e.code !== 'KeyS') {
        return;
      }
      const app = useAppStore.getState();
      if (app.document === null) {
        return;
      }
      e.preventDefault();
      useSnapshotStore.getState().request({ kind: 'feedback', pageId: app.selectedPageId });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return null;
}
