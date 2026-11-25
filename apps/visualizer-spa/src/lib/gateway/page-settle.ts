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

/** Страница, которую можно перевести на адрес. */
export type LoadingPage = {
  goto(url: string, opts: { waitUntil: 'load'; timeout: number }): Promise<unknown>;
  url(): string;
  waitForTimeout(ms: number): Promise<void>;
};

/** Сколько раз повторить оборванный переход и через сколько, мс. */
const NAV_RETRIES = 2;
const NAV_RETRY_MS = 300;

/**
 * Переход до события load. Браузер иногда обрывает первый переход новой вкладки
 * (ERR_ABORTED сразу после закрытия соседней вкладки того же контекста) — вкладка
 * остаётся about:blank; такой переход повторяется. Прочие ошибки — наверх.
 *
 * @param page - вкладка
 * @param url - адрес экрана
 */
export async function gotoLoaded(page: LoadingPage, url: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'load', timeout: LOAD_TIMEOUT_MS });
      return;
    } catch (e) {
      if (attempt >= NAV_RETRIES || page.url() !== 'about:blank') {
        throw e;
      }
      await page.waitForTimeout(NAV_RETRY_MS);
    }
  }
}

/**
 * После события load: дождаться затишья сети и отрисовки.
 *
 * @param page - страница, у которой уже было событие load
 */
export async function settleLoaded(page: SettlingPage): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_MS }).catch(() => undefined);
  await page.waitForTimeout(PAINT_MS);
}
