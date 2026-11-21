/**
 * Начать замечание: выбор компонента курсором или выделение области.
 */
import { useAppStore } from '../../store/app-store';
import { useCommentsStore } from '../../store/comments-store';
import { useSnapshotStore } from '../../store/snapshot-store';
import { useViewStore } from '../../store/view-store';

/**
 * Запускает выбор; область требует выбранного экрана.
 *
 * @param pick - компонент или область
 */
export function startComment(pick: 'element' | 'region'): void {
  const app = useAppStore.getState();
  if (app.document === null) {
    return;
  }
  const pageId = app.selectedPageId;
  if (pick === 'region' && pageId === null) {
    app.setToast('Выберите экран, к которому относится область');
    return;
  }
  useViewStore.getState().setView('screens');
  useCommentsStore.getState().closeDraft();
  if (!useSnapshotStore.getState().request({ kind: 'comment', pick, pageId })) {
    app.setToast('Снимок уже идёт');
  }
}
