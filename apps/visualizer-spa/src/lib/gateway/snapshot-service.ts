/**
 * Снимки экранов для «замороженных» нод: вместо живого iframe нода
 * показывает картинку. Снимает один headless Chromium в процессе
 * dev-сервера (не во вкладке пользователя): память вкладки не растёт от
 * числа экранов. Снимки — JPEG в `.lam-snapshots` (вне git), свежие
 * отдаются сразу, устаревшие — тоже сразу, а в фоне переснимаются.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Что нужно от браузера (Playwright chromium подходит). */
export type SnapshotBrowser = {
  newContext(opts: { viewport: { width: number; height: number }; deviceScaleFactor: number }): Promise<SnapshotContext>;
  close(): Promise<void>;
};
/** Контекст браузера. */
export type SnapshotContext = {
  newPage(): Promise<SnapshotPage>;
  close(): Promise<void>;
};
/** Страница. */
export type SnapshotPage = {
  goto(url: string, opts: { waitUntil: 'load'; timeout: number }): Promise<unknown>;
  waitForLoadState(state: 'networkidle', opts: { timeout: number }): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  screenshot(opts: { type: 'jpeg'; quality: number }): Promise<Uint8Array>;
};

/** Запрос снимка. */
export type SnapshotRequest = { readonly url: string; readonly width: number; readonly height: number };

/** Опции сервиса. */
export type SnapshotServiceOptions = {
  readonly dir: string;
  readonly launch: () => Promise<SnapshotBrowser>;
  /** Сколько снимок считается свежим, мс. */
  readonly freshMs?: number;
  /** Через сколько простоя закрыть браузер, мс. */
  readonly idleCloseMs?: number;
  /** Сколько снимков делать одновременно. */
  readonly concurrency?: number;
};

const DEFAULT_FRESH_MS = 10 * 60_000;
const DEFAULT_IDLE_CLOSE_MS = 60_000;
const DEFAULT_CONCURRENCY = 2;
/** Предел размеров окна снимка. */
const MAX_SIDE = 4000;

/**
 * Проверяет размеры снимка.
 *
 * @param w - ширина
 * @param h - высота
 */
export function isValidSnapshotSize(w: number, h: number): boolean {
  return Number.isInteger(w) && Number.isInteger(h) && w >= 200 && h >= 120 && w <= MAX_SIDE && h <= MAX_SIDE;
}

/** Сервис снимков. */
export class SnapshotService {
  private browser: Promise<SnapshotBrowser> | null = null;
  private readonly inflight = new Map<string, Promise<string>>();
  private readonly queue: Array<() => void> = [];
  private active = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly freshMs: number;
  private readonly idleCloseMs: number;
  private readonly concurrency: number;

  /**
   * @param opts - папка, запуск браузера, сроки
   */
  constructor(private readonly opts: SnapshotServiceOptions) {
    this.freshMs = opts.freshMs ?? DEFAULT_FRESH_MS;
    this.idleCloseMs = opts.idleCloseMs ?? DEFAULT_IDLE_CLOSE_MS;
    this.concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  }

  /** Файл снимка для запроса. */
  fileFor(req: SnapshotRequest): string {
    const key = createHash('sha1').update(`${req.url}|${req.width}|${req.height}`).digest('hex').slice(0, 24);
    return path.join(this.opts.dir, `${key}.jpg`);
  }

  /**
   * Путь к снимку: свежий или устаревший — сразу (устаревший переснимается
   * в фоне), нет снимка — ждёт съёмки.
   *
   * @param req - адрес и размер окна
   * @param refresh - переснять, даже если свежий
   */
  async get(req: SnapshotRequest, refresh = false): Promise<string> {
    const file = this.fileFor(req);
    const age = existsSync(file) ? Date.now() - statSync(file).mtimeMs : null;
    if (age !== null && !refresh) {
      if (age > this.freshMs) {
        void this.capture(req, file).catch(() => undefined);
      }
      return file;
    }
    return this.capture(req, file);
  }

  /** Закрывает браузер. */
  async close(): Promise<void> {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
    }
    const b = this.browser;
    this.browser = null;
    if (b !== null) {
      await (await b).close();
    }
  }

  private capture(req: SnapshotRequest, file: string): Promise<string> {
    const running = this.inflight.get(file);
    if (running !== undefined) {
      return running;
    }
    const p = this.slot(() => this.shoot(req, file)).finally(() => this.inflight.delete(file));
    this.inflight.set(file, p);
    return p;
  }

  private async slot<T>(job: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    try {
      return await job();
    } finally {
      this.active--;
      this.queue.shift()?.();
      if (this.active === 0 && this.queue.length === 0) {
        this.idleTimer = setTimeout(() => void this.close(), this.idleCloseMs);
      }
    }
  }

  private async shoot(req: SnapshotRequest, file: string): Promise<string> {
    this.browser ??= this.opts.launch();
    const browser = await this.browser;
    const ctx = await browser.newContext({ viewport: { width: req.width, height: req.height }, deviceScaleFactor: 1 });
    try {
      const page = await ctx.newPage();
      await page.goto(req.url, { waitUntil: 'load', timeout: 20_000 });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
      await page.waitForTimeout(400);
      const jpeg = await page.screenshot({ type: 'jpeg', quality: 72 });
      mkdirSync(this.opts.dir, { recursive: true });
      writeFileSync(file, jpeg);
      return file;
    } finally {
      await ctx.close();
    }
  }
}
