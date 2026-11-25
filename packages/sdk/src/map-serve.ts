/**
 * Сборка приложения для карты: `vite build --watch` в режиме разработки React
 * (один бандл вместо сотен модулей dev-сервера) и `vite preview` на порту
 * приложения. После каждой пересборки открытые страницы перезагружаются сами:
 * страница раз в секунду спрашивает номер сборки.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { InlineConfig, Plugin, PreviewServer } from 'vite';

/** Имя плагина-метки: lamVite видит его в конфиге и включает рантайм в сборку. */
export const MAP_BUILD_PLUGIN = 'live-app-map:map-build';

/** Адрес номера сборки. */
export const BUILD_ID_PATH = '/@lam/build-id';

/** Как часто страница спрашивает номер сборки, мс. */
const POLL_MS = 1000;

/** Опции сборки для карты. */
export type MapServeOptions = {
  /** Каталог приложения с vite.config. */
  readonly root: string;
  /** Порт preview; 0 — свободный. */
  readonly port: number;
  /** Адрес, на котором слушать (как server.host приложения, если не задан). */
  readonly host?: string;
  /** Куда собирать; по умолчанию `<root>/node_modules/.lam-map`. */
  readonly outDir?: string;
  /** Добавка к конфигу приложения (тесты: конфиг без файла); функция — у сборки и preview свои экземпляры плагинов. */
  readonly inline?: () => InlineConfig;
  /** Сообщения о пересборке. */
  readonly log?: (line: string) => void;
};

/** Запущенная сборка для карты. */
export type MapApp = {
  /** Адрес preview. */
  readonly url: string;
  /** Остановить слежение и сервер. */
  close(): Promise<void>;
};

type ViteApi = typeof import('vite');
type Watcher = { on(event: 'event', cb: (e: { code: string; error?: unknown; result?: { close(): Promise<void> } | null }) => void): void; close(): Promise<void> };

/**
 * Скрипт страницы: при новом номере сборки — перезагрузка.
 *
 * @param pollMs - период опроса
 */
export function reloadScript(pollMs: number): string {
  return '(function(){var id=null;function tick(){fetch(' + JSON.stringify(BUILD_ID_PATH) + ',{cache:"no-store"}).then(function(r){return r.ok?r.text():null}).then(function(t){if(t===null)return;if(id!==null&&t!==id){location.reload();return}id=t}).catch(function(){}).then(function(){setTimeout(tick,' + pollMs + ')})}tick()})();';
}

/**
 * Плагин сборки для карты: метка для lamVite, скрипт перезагрузки в HTML и номер сборки в preview.
 *
 * @param state - общий для сборки и preview номер сборки
 */
export function mapBuildPlugin(state: { buildId: number }): Plugin {
  return {
    name: MAP_BUILD_PLUGIN,
    transformIndexHtml: {
      order: 'pre',
      handler() {
        return [{ tag: 'script', children: reloadScript(POLL_MS), injectTo: 'head' }];
      },
    },
    closeBundle() {
      state.buildId += 1;
    },
    configurePreviewServer(s: PreviewServer) {
      s.middlewares.use((req, res, next) => {
        if ((req.url ?? '').split('?')[0] !== BUILD_ID_PATH) {
          next();
          return;
        }
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        res.end(String(state.buildId));
      });
    },
  };
}

/** Vite приложения, а не пакета: у приложения своя версия и свои плагины. */
async function importVite(root: string): Promise<ViteApi> {
  const file = createRequire(path.join(root, 'noop.js')).resolve('vite');
  return (await import(pathToFileURL(file).href)) as ViteApi;
}

function isWatcher(x: unknown): x is Watcher {
  return typeof x === 'object' && x !== null && 'on' in x && 'close' in x;
}

/** Ждёт конец первой сборки; ошибка первой сборки — исключение. */
function firstBuild(w: Watcher, log: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let first = true;
    w.on('event', (e) => {
      if (e.code === 'BUNDLE_END') {
        void e.result?.close();
      }
      if (e.code === 'ERROR') {
        log('сборка упала: ' + (e.error instanceof Error ? e.error.message : String(e.error)));
        if (first) {
          first = false;
          reject(e.error instanceof Error ? e.error : new Error(String(e.error)));
        }
      }
      if (e.code === 'END') {
        if (first) {
          first = false;
          resolve();
        } else {
          log('пересобрано');
        }
      }
    });
  });
}

/**
 * Собирает приложение в режиме разработки React, следит за исходниками и отдаёт сборку.
 *
 * @param o - каталог, порт, куда собирать
 * @returns адрес и остановка
 * @throws Error — первая сборка упала или порт занят
 */
export async function serveMapApp(o: MapServeOptions): Promise<MapApp> {
  const vite = await importVite(o.root);
  const log = o.log ?? ((line: string) => console.log('[lam-map] ' + line));
  const outDir = o.outDir ?? path.join(o.root, 'node_modules', '.lam-map');
  const state = { buildId: 0 };
  const extra = o.inline ?? ((): InlineConfig => ({}));
  // React и import.meta.env.DEV — как в dev: работают пикер компонентов и ветки разработки приложения
  const prevNodeEnv = process.env['NODE_ENV'];
  process.env['NODE_ENV'] = 'development';
  let watcher: Watcher;
  try {
    const own = extra();
    const built = await vite.build({
      ...own,
      root: o.root,
      mode: 'development',
      plugins: [...(own.plugins ?? []), mapBuildPlugin(state)],
      // Без сжатия: имена функций — имена компонентов в дереве React; карты — файлы исходников
      build: { ...own.build, outDir, emptyOutDir: true, sourcemap: true, minify: false, watch: {} },
    });
    if (!isWatcher(built)) {
      throw new Error('vite build без watch: не получили наблюдателя');
    }
    watcher = built;
  } finally {
    restoreEnv('NODE_ENV', prevNodeEnv);
  }
  try {
    await firstBuild(watcher, log);
  } catch (e) {
    await watcher.close();
    throw e;
  }
  const own = extra();
  const preview = await vite.preview({
    ...own,
    root: o.root,
    mode: 'development',
    plugins: [...(own.plugins ?? []), mapBuildPlugin(state)],
    build: { ...own.build, outDir },
    preview: { ...own.preview, port: o.port, strictPort: o.port !== 0, ...(o.host === undefined ? {} : { host: o.host }) },
  });
  const url = (preview.resolvedUrls?.local[0] ?? '').replace(/\/$/, '');
  return {
    url,
    async close() {
      await watcher.close();
      await preview.close();
    },
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
