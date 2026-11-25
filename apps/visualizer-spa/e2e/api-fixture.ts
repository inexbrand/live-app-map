/**
 * Роуты без авторского описания в карте проекта для e2e вида «API». В korbor описаны все роуты
 * (2026-11-25: 315 из 315), а фильтр «без описания» и описание из кода проверяются на роутах без него.
 * Каждый пятый роут карты отдаётся без doc и comments — так же, как роут без комментария над обработчиком.
 */
import type { Page } from '@playwright/test';
import { PROJECT_MAP } from './helpers';

type RouteDocs = { readonly doc?: string; readonly comments?: readonly string[] };
type MapWithRoutes = { readonly code?: { readonly routes: readonly RouteDocs[] } };

/**
 * Подменяет карту проекта во всём контексте: каждый пятый роут — без авторского описания.
 *
 * @param page - страница
 * @returns сколько роутов осталось без описания (после загрузки карты)
 */
export async function pinUndocumentedRoutes(page: Page): Promise<() => number> {
  let stripped: number | null = null;
  // По пути запроса: адрес страницы тоже содержит ?map=/__lam_project/map.json
  await page.context().route((url) => url.pathname === PROJECT_MAP, async (route) => {
    const res = await route.fetch();
    const map: MapWithRoutes = await res.json();
    if (map.code === undefined) {
      throw new Error('в карте проекта нет раздела code');
    }
    const routes = map.code.routes.map((r, i): RouteDocs => {
      if (i % 5 !== 0) {
        return r;
      }
      const { doc: _doc, comments: _comments, ...bare } = r;
      return bare;
    });
    stripped = routes.filter((r) => r.doc === undefined && (r.comments === undefined || r.comments.length === 0)).length;
    await route.fulfill({ response: res, json: { ...map, code: { ...map.code, routes } } });
  });
  return () => {
    if (stripped === null) {
      throw new Error('карта проекта ещё не загружена');
    }
    return stripped;
  };
}
