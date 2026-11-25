/**
 * Снимки экранов для «замороженных» нод: вместо живого iframe нода
 * показывает картинку. Снимает один headless Chromium в процессе
 * dev-сервера (не во вкладке пользователя): память вкладки не растёт от
 * числа экранов. Снимки — JPEG в `.lam-snapshots` (вне git), свежие
 * отдаются сразу, устаревшие — тоже сразу, а в фоне переснимаются.
 */
import { createHash } from 'node:crypto';
import type { AppMapStateStep } from '@live-app-map/schema';
import { gotoLoaded, settleLoaded, type LoadingPage, type SettlingPage } from './page-settle';
import { runStateSteps, type StepsPage } from '../stream/state-steps';
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
export type SnapshotPage = SettlingPage & StepsPage & LoadingPage & {
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  close(): Promise<void>;
  screenshot(opts: { type: 'jpeg'; quality: number }): Promise<Uint8Array>;
};

/** Запрос снимка. */
export type SnapshotRequest = {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  /** Шаги состояния после загрузки, до снимка. */
  readonly steps?: readonly AppMapStateStep[];
};

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
/** 4: каждый снимок ~1 с на тёплом кэше модулей; браузер карты держит под картинки столько же соединений из 6. */
const DEFAULT_CONCURRENCY = 4;
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
  /**
   * Один контекст на все снимки: модули dev-сервера (сотни файлов на экран)
   * остаются в кэше браузера — новый контекст качал их заново, 4–7 с на снимок.
   */
  private context: Promise<SnapshotContext> | null = null;
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
    const steps = req.steps === undefined || req.steps.length === 0 ? '' : `|${JSON.stringify(req.steps)}`;
    const key = createHash('sha1').update(`${req.url}|${req.width}|${req.height}${steps}`).digest('hex').slice(0, 24);
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
    this.context = null;
    if (b !== null) {
      await b.then((browser) => browser.close(), () => undefined);
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

  /** Запуск браузера; неудачный не запоминается, иначе его ждали бы снова и close() бросал бы. */
  private openBrowser(): Promise<SnapshotBrowser> {
    if (this.browser === null) {
      const launching = this.opts.launch();
      this.browser = launching;
      launching.catch(() => {
        if (this.browser === launching) {
          this.browser = null;
        }
      });
    }
    return this.browser;
  }

  /** Общий контекст; неудачный не запоминается. */
  private openContext(): Promise<SnapshotContext> {
    if (this.context === null) {
      const opening = this.openBrowser().then((b) => b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }));
      this.context = opening;
      opening.catch(() => {
        if (this.context === opening) {
          this.context = null;
        }
      });
    }
    return this.context;
  }

  private async shoot(req: SnapshotRequest, file: string): Promise<string> {
    const ctx = await this.openContext();
    const page = await ctx.newPage();
    try {
      await page.setViewportSize({ width: req.width, height: req.height });
      await gotoLoaded(page, req.url);
      await settleLoaded(page);
      // Сбой шага снимок не отменяет: подпись об ошибке шага даёт трансляция
      await runStateSteps(page, req.steps ?? []);
      const jpeg = await page.screenshot({ type: 'jpeg', quality: 72 });
      mkdirSync(this.opts.dir, { recursive: true });
      writeFileSync(file, jpeg);
      return file;
    } finally {
      await page.close().catch(() => undefined);
    }
  }
}
