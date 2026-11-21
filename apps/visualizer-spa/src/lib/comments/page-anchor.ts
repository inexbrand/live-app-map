/**
 * Экран для привязки замечания по состоянию визуализатора.
 */
import type { CommentAnchor } from '@live-app-map/mcp-server/comments-schema';
import { useAppStore } from '../../store/app-store';
import type { AnchorPage } from './build-anchor';

/**
 * Экран по id ноды или null, если ноды нет в карте.
 *
 * @param pageId - id ноды
 */
export function anchorPage(pageId: string): AnchorPage | null {
  const s = useAppStore.getState();
  const node = s.index?.nodesById.get(pageId);
  return node === undefined ? null : { id: pageId, title: node.title, url: s.resolveLiveUrl(pageId) };
}

/** Имя карты и роль для привязки. */
export function anchorContext(): { readonly mapName: string | null; readonly role: string | null } {
  const s = useAppStore.getState();
  return { mapName: s.document?.project.name ?? null, role: s.globalRole === '' ? null : s.globalRole };
}

/**
 * Привязка к экрану целиком (замечание по выделенной области).
 *
 * @param page - экран
 */
export function screenAnchor(page: AnchorPage): CommentAnchor {
  return { ...anchorContext(), pageId: page.id, pageTitle: page.title, pageUrl: page.url, element: null };
}
