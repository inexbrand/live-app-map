/**
 * Когда страницу экрана можно показывать: событие load, затем затишье сети
 * (не дольше 8 с) и ещё 400 мс на отрисовку. Одно правило для снимка шлюза
 * и трансляции: иначе трансляция показывала пустой белый документ, пока
 * снимок ждал готовую страницу.
 */

/** Страница браузера: ожидание состояния загрузки. */
export type SettlingPage = {
  waitForLoadState(state: 'networkidle', opts: { timeout: number }): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
};

/** Сколько ждать события load при переходе, мс. */
export const LOAD_TIMEOUT_MS = 20_000;
const NETWORK_IDLE_MS = 8000;
const PAINT_MS = 400;

/**
 * После события load: дождаться затишья сети и отрисовки.
 *
 * @param page - страница, у которой уже было событие load
 */
export async function settleLoaded(page: SettlingPage): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_MS }).catch(() => undefined);
  await page.waitForTimeout(PAINT_MS);
}
