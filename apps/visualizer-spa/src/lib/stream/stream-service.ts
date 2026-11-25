/**
 * Трансляция экранов: headless-браузер держит страницу на каждый смонтированный
 * экран карты, у живых идут кадры (CDP Page.startScreencast). Страница общается
 * с картой как раньше из iframe — parent.postMessage: в headless parent — сама
 * страница, мост ловит такие сообщения и отдаёт карте. Сверка набора — один
 * писатель: вызовы sync выполняются строго по очереди.
 */
import type { Browser, BrowserContext, CDPSession, Page } from '@playwright/test';
import { settleLoaded } from '../gateway/page-settle';
import { runStateSteps } from './state-steps';
import { PAGE_TO_HOST_TYPES, isPageToHost, planSync, type PageInput, type StreamScreen } from './stream-protocol';

/** Опции сервиса. */
export type StreamServiceOptions = {
  readonly launch: () => Promise<Browser>;
  readonly onFrame: (key: string, jpeg: Uint8Array) => void;
  readonly onPageMessage: (key: string, data: unknown) => void;
  /** Итог шагов состояния экрана: null — выполнены, иначе «шаг N не выполнен: …». */
  readonly onSteps?: (key: string, error: string | null) => void;
  /** Качество JPEG, 1–100. */
  readonly quality?: number;
};

/**
 * Открытая страница экрана. readyAt — с какого момента (секунды эпохи, как
 * metadata.timestamp кадра CDP) кадры показывают догруженную страницу; до
 * него — пустой документ, и карта такие кадры не получает, даже если они
 * доходят с опозданием. Пока страница грузится — Infinity. load — номер
 * документа: готовность старого документа новый не отмечает.
 */
type Entry = { screen: StreamScreen; readonly page: Page; readonly cdp: CDPSession; readyAt: number; load: number; stepsPending: boolean };

const DEFAULT_QUALITY = 70;
/** Сколько раз повторить оборванный переход и через сколько, мс. */
const NAV_RETRIES = 2;
const NAV_RETRY_MS = 300;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const HOST_BINDING = '__lamHost';

/**
 * Глобал вкладки с ключом экрана. По адресу вкладку не узнать: приложение уходит
 * редиректом (мини-апп / → #/feed), у разных экранов адрес бывает одинаковым —
 * e2e находят вкладку экрана по этому ключу через CDP.
 */
export const SCREEN_KEY_GLOBAL = '__lamScreenKey';

/** Мост в странице: сообщения страницы «родителю» (себе) уходят карте. */
const BRIDGE = `(function(){var T=${JSON.stringify(PAGE_TO_HOST_TYPES)};addEventListener('message',function(e){var d=e.data;if(e.source!==window||!d||T.indexOf(d.lam)<0)return;try{window.${HOST_BINDING}(JSON.stringify(d));}catch(_){}});})();`;

/** Сервис трансляции. */
export class StreamService {
  private browser: Promise<Browser> | null = null;
  private ctx: Promise<BrowserContext> | null = null;
  private readonly entries = new Map<string, Entry>();
  private readonly last = new Map<string, Uint8Array>();
  private queue: Promise<void> = Promise.resolve();
  private readonly quality: number;

  constructor(private readonly opts: StreamServiceOptions) {
    this.quality = opts.quality ?? DEFAULT_QUALITY;
  }

  /**
   * Привести открытые страницы к набору карты. Повторный вызов с тем же набором ничего не меняет.
   *
   * @param screens - нужный набор экранов
   */
  sync(screens: readonly StreamScreen[]): Promise<void> {
    const run = this.queue.then(() => this.apply(screens));
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Сообщение карты в страницу (как postMessage родителя в iframe).
   *
   * @param key - экран
   * @param data - сообщение
   */
  async post(key: string, data: unknown): Promise<void> {
    await this.entries
      .get(key)
      ?.page.evaluate((d) => window.postMessage(d, '*'), data)
      .catch(() => undefined);
  }

  /**
   * Ввод в страницу.
   *
   * @param key - экран
   * @param input - мышь, колесо или клавиша
   */
  async input(key: string, input: PageInput): Promise<void> {
    const page = this.entries.get(key)?.page;
    if (page !== undefined) {
      await dispatchInput(page, input).catch(() => undefined);
    }
  }

  /** Последний кадр каждого экрана, что транслировался (и после закрытия страницы). */
  lastFrames(): ReadonlyMap<string, Uint8Array> {
    return this.last;
  }

  /** Ключи открытых страниц. */
  openKeys(): string[] {
    return [...this.entries.keys()];
  }

  /** Закрыть браузер. */
  async close(): Promise<void> {
    await this.queue;
    this.entries.clear();
    const b = this.browser;
    this.browser = null;
    this.ctx = null;
    await b?.then((x) => x.close(), () => undefined);
  }

  private async apply(screens: readonly StreamScreen[]): Promise<void> {
    const current = new Map([...this.entries].map(([k, e]) => [k, e.screen]));
    const plan = planSync(current, screens);
    await Promise.all(plan.close.map((k) => this.closeEntry(k)));
    for (const s of plan.stop) {
      await this.setLive(s, false);
    }
    for (const s of plan.resize) {
      await this.resize(s);
    }
    for (const s of plan.navigate) {
      this.rememberScreen(s);
      const e = this.entries.get(s.key);
      if (e !== undefined) {
        void this.go(e, s.url, NAV_RETRIES);
      }
    }
    for (const s of plan.start) {
      await this.setLive(s, true);
    }
    for (const s of plan.open) {
      await this.open(s);
    }
  }

  private context(): Promise<BrowserContext> {
    if (this.ctx === null) {
      const launching = this.opts.launch();
      this.browser = launching;
      this.ctx = launching.then((b) => b.newContext({ ignoreHTTPSErrors: true }));
      this.ctx.catch(() => {
        this.browser = null;
        this.ctx = null;
      });
    }
    return this.ctx;
  }

  private async open(screen: StreamScreen): Promise<void> {
    const ctx = await this.context();
    const page = await ctx.newPage();
    await page.setViewportSize({ width: screen.width, height: screen.height });
    await page.exposeBinding(HOST_BINDING, (_src, json: unknown) => this.fromPage(screen.key, json));
    await page.addInitScript(BRIDGE);
    await page.addInitScript(`window.${SCREEN_KEY_GLOBAL}=${JSON.stringify(screen.key)};`);
    const cdp = await ctx.newCDPSession(page);
    const entry: Entry = { screen: { ...screen, live: false }, page, cdp, readyAt: Infinity, load: 0, stepsPending: false };
    cdp.on('Page.screencastFrame', (f) => {
      void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
      if ((f.metadata.timestamp ?? 0) >= entry.readyAt) {
        this.emit(screen.key, f.data);
      }
    });
    // Готовность — у документа, а не у вызова goto: страница уходит на новый
    // документ и сама (ссылка, location.reload, редирект), и тогда снова пустая.
    page.on('request', (req) => {
      if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
        entry.load += 1;
        entry.readyAt = Infinity;
      }
    });
    page.on('load', () => void this.settle(entry));
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    this.entries.set(screen.key, entry);
    if (screen.live) {
      await this.setLive(screen, true);
    }
    // Не ждём загрузку: следующий экран открывается сразу, кадр придёт после неё.
    void this.go(entry, screen.url, NAV_RETRIES);
  }

  /**
   * Переход экрана. Браузер иногда обрывает первый переход новой вкладки
   * (ERR_ABORTED сразу после закрытия соседней с незавершённой загрузкой) —
   * вкладка остаётся пустой about:blank навсегда; такой переход повторяем.
   */
  private async go(e: Entry, url: string, retries: number): Promise<void> {
    // Шаги — один раз на переход карты: документ, на который увёл сам шаг, их не повторяет
    e.stepsPending = (e.screen.steps?.length ?? 0) > 0;
    const failed = await e.page.goto(url, { waitUntil: 'commit' }).then(() => false, () => true);
    if (failed && retries > 0 && this.entries.get(e.screen.key) === e && e.page.url() === 'about:blank') {
      await sleep(NAV_RETRY_MS);
      await this.go(e, url, retries - 1);
    }
  }

  /**
   * Документ догрузился: кадры открыты, и сразу один кадр готовой страницы —
   * трансляция шлёт кадры только на изменения, и неподвижная страница иначе
   * так и осталась бы без кадра.
   */
  private async settle(e: Entry): Promise<void> {
    const load = e.load;
    // Страницу закрыли, пока ждали, — дальше проверка ниже вернёт управление
    await settleLoaded(e.page).catch(() => undefined);
    // about:blank — не экран: пустая вкладка до перехода или после оборванного
    if (e.load !== load || this.entries.get(e.screen.key) !== e || e.page.url() === 'about:blank') {
      return;
    }
    if (e.stepsPending) {
      e.stepsPending = false;
      const error = await runStateSteps(e.page, e.screen.steps ?? []);
      // Страницу закрыли во время шагов — их итог не про экран (ошибка «page closed» ложная)
      if (this.entries.get(e.screen.key) !== e) {
        return;
      }
      this.opts.onSteps?.(e.screen.key, error);
      // Шаг увёл на другой документ — готовность отметит его загрузка
      if (e.load !== load) {
        return;
      }
    }
    e.readyAt = Date.now() / 1000;
    const shot = await e.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: this.quality }).catch(() => null);
    if (shot !== null && e.load === load) {
      this.emit(e.screen.key, shot.data);
    }
  }

  private emit(key: string, base64: string): void {
    const jpeg = new Uint8Array(Buffer.from(base64, 'base64'));
    this.last.set(key, jpeg);
    this.opts.onFrame(key, jpeg);
  }

  private fromPage(key: string, json: unknown): void {
    if (typeof json !== 'string') {
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      return;
    }
    if (isPageToHost(data)) {
      this.opts.onPageMessage(key, data);
    }
  }

  private rememberScreen(s: StreamScreen): void {
    const e = this.entries.get(s.key);
    if (e !== undefined) {
      e.screen = { ...s, live: e.screen.live };
    }
  }

  private async resize(s: StreamScreen): Promise<void> {
    const e = this.entries.get(s.key);
    if (e === undefined) {
      return;
    }
    const wasLive = e.screen.live;
    e.screen = { ...s, url: e.screen.url, live: wasLive };
    await e.page.setViewportSize({ width: s.width, height: s.height }).catch(() => undefined);
    if (wasLive) {
      // Предел размера кадра — от окна: перезапуск трансляции с новым окном
      await this.setLive(e.screen, false);
      await this.setLive(e.screen, true);
    }
  }

  private async setLive(s: StreamScreen | string, live: boolean): Promise<void> {
    const e = this.entries.get(typeof s === 'string' ? s : s.key);
    if (e === undefined || e.screen.live === live) {
      return;
    }
    e.screen = { ...e.screen, live };
    const cmd = live
      ? e.cdp.send('Page.startScreencast', { format: 'jpeg', quality: this.quality, maxWidth: e.screen.width, maxHeight: e.screen.height, everyNthFrame: 1 })
      : e.cdp.send('Page.stopScreencast');
    await cmd.catch(() => undefined);
  }

  private async closeEntry(key: string): Promise<void> {
    const e = this.entries.get(key);
    this.entries.delete(key);
    await e?.page.close().catch(() => undefined);
  }
}

/**
 * Ввод через Playwright: мышь, колесо, клавиши. Печатный символ — type (вне
 * раскладки Playwright вставляет текст), служебная клавиша — down/up.
 */
async function dispatchInput(page: Page, input: PageInput): Promise<void> {
  if (input.kind === 'mouse') {
    await page.mouse.move(input.x, input.y);
    if (input.type === 'down') {
      await page.mouse.down({ button: input.button, clickCount: input.clickCount });
    }
    if (input.type === 'up') {
      await page.mouse.up({ button: input.button, clickCount: input.clickCount });
    }
    return;
  }
  if (input.kind === 'wheel') {
    await page.mouse.move(input.x, input.y);
    await page.mouse.wheel(input.dx, input.dy);
    return;
  }
  if ([...input.key].length === 1) {
    if (input.type === 'down') {
      await page.keyboard.type(input.key);
    }
    return;
  }
  await (input.type === 'down' ? page.keyboard.down(input.key) : page.keyboard.up(input.key));
}
