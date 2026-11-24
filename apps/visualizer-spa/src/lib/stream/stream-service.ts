/**
 * Трансляция экранов: headless-браузер держит страницу на каждый смонтированный
 * экран карты, у живых идут кадры (CDP Page.startScreencast). Страница общается
 * с картой как раньше из iframe — parent.postMessage: в headless parent — сама
 * страница, мост ловит такие сообщения и отдаёт карте. Сверка набора — один
 * писатель: вызовы sync выполняются строго по очереди.
 */
import type { Browser, BrowserContext, CDPSession, Page } from '@playwright/test';
import { PAGE_TO_HOST_TYPES, isPageToHost, planSync, type PageInput, type StreamScreen } from './stream-protocol';

/** Опции сервиса. */
export type StreamServiceOptions = {
  readonly launch: () => Promise<Browser>;
  readonly onFrame: (key: string, jpeg: Uint8Array) => void;
  readonly onPageMessage: (key: string, data: unknown) => void;
  /** Качество JPEG, 1–100. */
  readonly quality?: number;
};

type Entry = { screen: StreamScreen; readonly page: Page; readonly cdp: CDPSession };

const DEFAULT_QUALITY = 70;
const HOST_BINDING = '__lamHost';

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
      void this.entries.get(s.key)?.page.goto(s.url, { waitUntil: 'commit' }).catch(() => undefined);
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
    const cdp = await ctx.newCDPSession(page);
    cdp.on('Page.screencastFrame', (f) => {
      void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
      const jpeg = new Uint8Array(Buffer.from(f.data, 'base64'));
      this.last.set(screen.key, jpeg);
      this.opts.onFrame(screen.key, jpeg);
    });
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    this.entries.set(screen.key, { screen: { ...screen, live: false }, page, cdp });
    if (screen.live) {
      await this.setLive(screen, true);
    }
    // Не ждём загрузку: следующий экран открывается сразу, кадры придут сами.
    void page.goto(screen.url, { waitUntil: 'commit' }).catch(() => undefined);
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
