/**
 * Начать замечание: выбор компонента курсором или выделение области.
 */
import { useAppStore } from '../../store/app-store';
import { useCommentsStore } from '../../store/comments-store';
import { isElementPick, useSnapshotStore } from '../../store/snapshot-store';
import { useViewStore } from '../../store/view-store';

/** Экран замечания: кнопка ноды выбирает свой экран, иначе — выбранный. */
function pageFor(forPage: string | undefined): string | null {
  const app = useAppStore.getState();
  if (forPage !== undefined && app.selectedPageId !== forPage) {
    app.selectPage(forPage);
  }
  return forPage ?? app.selectedPageId;
}

/** Идущий выбор компонента уступает выделению области. */
function cancelElementPick(): void {
  const snap = useSnapshotStore.getState();
  if (isElementPick(snap.session)) {
    snap.cancel();
  }
}

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
  const pageId = pageFor(forPage);
  if (pick === 'region' && pageId === null) {
    app.setToast('Выберите экран, к которому относится область');
    return;
  }
  useViewStore.getState().setView('screens');
  useCommentsStore.getState().closeDraft();
  if (pick === 'region') {
    cancelElementPick();
  }
  if (!useSnapshotStore.getState().request({ kind: 'comment', pick, pageId })) {
    app.setToast('Снимок уже идёт');
  }
}