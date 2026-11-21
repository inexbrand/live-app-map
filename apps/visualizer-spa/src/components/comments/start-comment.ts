/**
 * Начать замечание: выбор компонента курсором или выделение области.
 */
import { useAppStore } from '../../store/app-store';
import { useCommentsStore } from '../../store/comments-store';
import { isElementPick, useSnapshotStore } from '../../store/snapshot-store';
import { useViewStore } from '../../store/view-store';

/**
 * Запускает выбор; область требует выбранного экрана. Идущий выбор
 * компонента можно сменить на область (кнопка в подсказке).
 *
 * @param pick - компонент или область
 * @param forPage - экран, с которого начали (кнопка в шапке ноды)
 */
export function startComment(pick: 'element' | 'region', forPage?: string): void {
  const app = useAppStore.getState();
  if (app.document === null) {
    return;
  }
  if (forPage !== undefined && app.selectedPageId !== forPage) {
    app.selectPage(forPage);
  }
  const pageId = forPage ?? app.selectedPageId;
  if (pick === 'region' && pageId === null) {
    app.setToast('Выберите экран, к которому относится область');
    return;
  }
  useViewStore.getState().setView('screens');
  useCommentsStore.getState().closeDraft();
  const snap = useSnapshotStore.getState();
  if (isElementPick(snap.session) && pick === 'region') {
    snap.cancel();
  }
  if (!useSnapshotStore.getState().request({ kind: 'comment', pick, pageId })) {
    app.setToast('Снимок уже идёт');
  }
}
