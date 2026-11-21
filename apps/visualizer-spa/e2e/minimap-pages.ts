/**
 * Счёт экранов карты в e2e. Холст рисует только видимые ноды
 * (onlyRenderVisibleElements), мини-карта — все.
 */
import type { Page } from '@playwright/test';

/**
 * Экраны карты на мини-карте (рамки групп и сервисы не считаются).
 *
 * @param page - страница визуализатора с загруженной картой
 */
export function minimapPages(page: Page): Promise<number> {
  return page.locator('.react-flow__minimap-node.lam-minimap-page').count();
}
