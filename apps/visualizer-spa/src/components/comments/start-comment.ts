/**
 * Действия фокуса экрана: замечание к экрану целиком, область мышью, режим
 * выбора компонента или работы с приложением, соседний экран.
 */
import { anchorPage, screenAnchor } from '../../lib/comments/page-anchor';
import { useAppStore } from '../../store/app-store';
import { useCommentsStore } from '../../store/comments-store';
import { useSnapshotStore } from '../../store/snapshot-store';
import { useViewStore } from '../../store/view-store';

/**
 * Окно замечания к экрану целиком (W).
 *
 * @param pageId - экран; по умолчанию выбранный
 */
export function commentOnScreen(pageId?: string): void {
  const app = useAppStore.getState();
  const id = pageId ?? app.selectedPageId;
  const page = id === null ? null : anchorPage(id);
  if (page === null) {
    app.setToast('Выберите экран');
    return;
  }
  useViewStore.getState().setView('screens');
  if (app.selectedPageId !== page.id) {
    app.selectPage(page.id);
  }
  useCommentsStore.getState().openTarget({ anchor: screenAnchor(page), frame: null, shot: null });
}

/** Замечание по выделенной мышью области выбранного экрана (⌥⇧S): снимок вкладки. */
export function startRegionComment(): void {
  const app = useAppStore.getState();
  if (app.document === null) {
    return;
  }
  if (app.selectedPageId === null) {
    app.setToast('Выберите экран, к которому относится область');
    return;
  }
  useCommentsStore.getState().closeTarget();
  if (!useSnapshotStore.getState().request({ kind: 'comment', pageId: app.selectedPageId })) {
    app.setToast('Снимок уже идёт');
  }
}

/**
 * Режим выбранного экрана: выбор компонента (C) или работа с приложением (I).
 *
 * @param mode - режим
 */
export function setFocusMode(mode: 'pick' | 'interact'): void {
  const app = useAppStore.getState();
  if (app.selectedPageId !== null) {
    app.setInteract(mode === 'interact' ? app.selectedPageId : null);
  }
}

/**
 * Соседний экран карты по порядку экранов ([ и ]).
 *
 * @param from - текущий экран
 * @param by - шаг: -1 — предыдущий, 1 — следующий
 * @returns id соседа или null
 */
export function neighborPage(from: string, by: -1 | 1): string | null {
  const pages = useAppStore.getState().document?.nodes.filter((n) => n.kind === 'page') ?? [];
  const i = pages.findIndex((n) => n.id === from);
  return i < 0 ? null : (pages[i + by]?.id ?? null);
}

/**
 * Перейти к соседнему экрану.
 *
 * @param by - шаг
 */
export function goNeighbor(by: -1 | 1): void {
  const app = useAppStore.getState();
  const next = app.selectedPageId === null ? null : neighborPage(app.selectedPageId, by);
  if (next !== null) {
    app.selectPage(next);
  }
}
