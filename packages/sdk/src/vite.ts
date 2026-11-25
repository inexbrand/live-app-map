/**
 * Плагин Vite: рантайм Live App Map в странице, описание состояний
 * (GET /@lam/state) и страница отдельного компонента (GET /@lam/component).
 * Работает на dev-сервере и в сборке для карты (serveMapApp, map-serve.ts);
 * в обычной `vite build` ничего не добавляет.
 */
import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { MAP_BUILD_PLUGIN, reloadScript } from './map-serve';
import { LAM_STATE_PARAM } from './project';
import { lamRuntimeScript } from './runtime/install';
import type { LamStatesModule } from './states-file';
import { findProjectDir, LAM_DIR, lookupState, parseExportRef } from './states-file';

/** Опции плагина. */
export type LamViteOptions = {
  /** Корень проекта с папкой `.live-app-map`; нет — поиск вверх от root Vite. */
  readonly projectDir?: string;
  /** Обёртка страницы компонента (провайдеры): `apps/miniapp/src/app/providers.tsx#AppProviders`, путь от корня проекта. */
  readonly wrapper?: string;
  /** Стили страницы компонента, пути от корня проекта: `['apps/miniapp/src/index.css']`. */
  readonly styles?: readonly string[];
};

/** Адрес модуля входа страницы компонента (виртуальный). */
const ENTRY_PATH = '/@lam/entry.js';
const ENTRY_ID = '\0lam-entry';
/** Вход всех компонентов в сборке для карты и его HTML в каталоге сборки. */
const BUNDLE_ID = '\0lam-components';
const BUNDLE_NAME = 'lam-components';
const BUNDLE_HTML = 'lam-component.html';

/** Путь файла для import в коде, который обработает Vite: /@fs/C:/… */
export function fsImportPath(abs: string): string {
  const p = abs.replace(/\\/g, '/');
  return '/@fs/' + p.replace(/^\/+/, '');
}

/** Что нужно модулю входа страницы компонента. */
export type ComponentEntryInput = {
  readonly statesFile: string;
  readonly componentFile: string;
  readonly exportName: string;
  readonly key: string;
  readonly variant: string;
  readonly wrapper: { readonly file: string; readonly name: string } | null;
  readonly styles: readonly string[];
};

/**
 * Код модуля входа: импорт компонента, вариант из states.ts, рендер с пропсами
 * варианта в обёртке. Пути — абсолютные.
 */
export function componentEntryCode(o: ComponentEntryInput): string {
  const lines = [
    "import { createElement } from 'react';",
    "import { createRoot } from 'react-dom/client';",
    'import { components as __lamFixtures } from ' + JSON.stringify(fsImportPath(o.statesFile)) + ';',
    'import { ' + o.exportName + ' as __LamTarget } from ' + JSON.stringify(fsImportPath(o.componentFile)) + ';',
  ];
  if (o.wrapper !== null) {
    lines.push('import { ' + o.wrapper.name + ' as __LamWrapper } from ' + JSON.stringify(fsImportPath(o.wrapper.file)) + ';');
  }
  for (const s of o.styles) {
    lines.push('import ' + JSON.stringify(fsImportPath(s)) + ';');
  }
  lines.push(
    'const __lamVariant = (__lamFixtures?.[' + JSON.stringify(o.key) + '] ?? []).find((v) => v.id === ' + JSON.stringify(o.variant) + ');',
    "const __lamRoot = document.getElementById('lam-component-root');",
    'const __lamEl = createElement(__LamTarget, __lamVariant?.props ?? {});',
    'createRoot(__lamRoot).render(' + (o.wrapper !== null ? 'createElement(__LamWrapper, null, __lamEl)' : '__lamEl') + ');',
  );
  return lines.join('\n') + '\n';
}

/** Что нужно модулю всех компонентов сборки для карты. */
export type ComponentsBundleInput = {
  readonly statesFile: string;
  /** Ключи «<файл>#<экспорт>» и абсолютный путь файла. */
  readonly components: readonly { readonly key: string; readonly file: string; readonly name: string }[];
  readonly wrapper: { readonly file: string; readonly name: string } | null;
  readonly styles: readonly string[];
};

const slash = (p: string): string => p.replace(/\\/g, '/');

/**
 * Код входа страницы компонента в сборке: все компоненты из states.ts ленивыми
 * импортами, нужный — по key и variant из адреса.
 */
export function componentsBundleCode(o: ComponentsBundleInput): string {
  const lines = [
    "import { createElement } from 'react';",
    "import { createRoot } from 'react-dom/client';",
    'import { components as __lamFixtures } from ' + JSON.stringify(slash(o.statesFile)) + ';',
  ];
  if (o.wrapper !== null) {
    lines.push('import { ' + o.wrapper.name + ' as __LamWrapper } from ' + JSON.stringify(slash(o.wrapper.file)) + ';');
  }
  for (const s of o.styles) {
    lines.push('import ' + JSON.stringify(slash(s)) + ';');
  }
  lines.push('const __lamLoaders = {');
  for (const c of o.components) {
    lines.push('  ' + JSON.stringify(c.key) + ': () => import(' + JSON.stringify(slash(c.file)) + ').then((m) => m[' + JSON.stringify(c.name) + ']),');
  }
  lines.push(
    '};',
    'const __lamQuery = new URLSearchParams(location.search);',
    "const __lamKey = __lamQuery.get('key') ?? '';",
    "const __lamVariant = (__lamFixtures?.[__lamKey] ?? []).find((v) => v.id === __lamQuery.get('variant'));",
    'const __lamLoad = __lamLoaders[__lamKey];',
    'if (__lamLoad !== undefined) {',
    '  __lamLoad().then((__LamTarget) => {',
    '    const __lamEl = createElement(__LamTarget, __lamVariant?.props ?? {});',
    "    createRoot(document.getElementById('lam-component-root')).render(" + (o.wrapper !== null ? 'createElement(__LamWrapper, null, __lamEl)' : '__lamEl') + ');',
    '  });',
    '}',
  );
  return lines.join('\n') + '\n';
}

/** HTML страницы компонента в сборке: рантайм, стили входа, модуль входа. */
export function componentsBundleHtml(runtime: string, entry: string, css: readonly string[]): string {
  const links = css.map((c) => '<link rel="stylesheet" href="/' + escapeHtml(c) + '" />\n').join('');
  return '<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<script>' + runtime + '</script>\n' +
    links + '</head>\n<body>\n<div id="lam-component-root"></div>\n<script type="module" src="/' + escapeHtml(entry) + '"></script>\n</body>\n</html>\n';
}

/** Экранирование текста для HTML. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** HTML страницы компонента (до transformIndexHtml). */
export function componentPageHtml(key: string, variant: string, label: string): string {
  const src = ENTRY_PATH + '?key=' + encodeURIComponent(key) + '&variant=' + encodeURIComponent(variant);
  return '<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>' +
    escapeHtml(label) + '</title>\n</head>\n<body>\n<div id="lam-component-root"></div>\n<script type="module" src="' + escapeHtml(src) + '"></script>\n</body>\n</html>\n';
}

/** Ответ текстом с кодом. */
function sendText(res: ServerResponse, status: number, type: string, body: string): void {
  res.statusCode = status;
  res.setHeader('content-type', type + '; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(body);
}

/** Где работает плагин: dev-сервер, сборка или preview для карты; иначе ничего не делает. */
type LamMode = 'dev' | 'map-build' | 'map-preview' | 'off';

/** Загрузка states.ts без dev-сервера: свежая копия модуля на каждый вызов. */
async function importStates(file: string): Promise<LamStatesModule> {
  const { runnerImport } = await import('vite');
  const { module } = await runnerImport<LamStatesModule>(file, { configFile: false, logLevel: 'error' });
  return module;
}

/**
 * Плагин Vite Live App Map.
 *
 * @param opts - папка проекта, обёртка и стили страницы компонента
 */
export function lamVite(opts: LamViteOptions = {}): Plugin {
  let projectDir: string | null = null;
  let server: ViteDevServer | null = null;
  let mode: LamMode = 'off';
  let isPreview = false;
  let outDir = '';
  let bundled: ComponentsBundleInput | null = null;

  const statesFile = (): string | null => (projectDir === null ? null : path.join(projectDir, LAM_DIR, 'states.ts'));
  const missing = (): string =>
    'Live App Map: не найден ' + LAM_DIR + '/states.ts (искали вверх от root Vite' + (opts.projectDir !== undefined ? ' и в ' + opts.projectDir : '') + '). ' +
    'Создайте его: export const screens = {…}; export const components = {…} — или укажите lamVite({ projectDir }).';

  const wrapperRef = (): { readonly file: string; readonly name: string } | null => {
    const wrapper = opts.wrapper === undefined ? null : parseExportRef(opts.wrapper);
    if (opts.wrapper !== undefined && wrapper === null) {
      throw new Error('Live App Map: опция wrapper «' + opts.wrapper + '» не в формате <файл от корня проекта>#<экспорт>');
    }
    return wrapper === null || projectDir === null ? null : { file: path.join(projectDir, wrapper.file), name: wrapper.name };
  };

  const loadStates = async (file: string): Promise<LamStatesModule> => {
    if (server === null) {
      return importStates(file);
    }
    const id = file.replace(/\\/g, '/');
    const cached = server.moduleGraph.getModuleById(id);
    if (cached !== undefined) {
      server.moduleGraph.invalidateModule(cached);
    }
    return (await server.ssrLoadModule(id)) as LamStatesModule;
  };

  const handleState = async (url: URL, res: ServerResponse): Promise<void> => {
    const file = statesFile();
    const id = url.searchParams.get('id') ?? '';
    if (file === null) {
      sendText(res, 404, 'text/plain', missing());
      return;
    }
    if (id === '') {
      sendText(res, 400, 'text/plain', 'Нужен параметр id: /@lam/state?id=<id экрана>/<id состояния>');
      return;
    }
    const found = lookupState(await loadStates(file), id, file);
    if (found.ok) {
      sendText(res, 200, 'application/json', JSON.stringify(found.payload));
    } else {
      sendText(res, 404, 'text/plain', found.error);
    }
  };

  const handleComponent = async (req: IncomingMessage, url: URL, res: ServerResponse): Promise<void> => {
    const file = statesFile();
    const key = url.searchParams.get('key') ?? '';
    const variant = url.searchParams.get('variant') ?? '';
    if (file === null) {
      sendText(res, 404, 'text/plain', missing());
      return;
    }
    if (parseExportRef(key) === null || variant === '') {
      sendText(res, 400, 'text/plain', 'Нужны key=<файл от корня проекта>#<экспорт> и variant=<id варианта>: /@lam/component?key=src/ui/Button.tsx%23Button&variant=primary');
      return;
    }
    const found = lookupState(await loadStates(file), 'component:' + key + '/' + variant, file);
    if (!found.ok) {
      sendText(res, 404, 'text/plain', found.error);
      return;
    }
    if (server === null) {
      // Сборка для карты: страница компонентов уже собрана, компонент она выберет по адресу
      sendText(res, 200, 'text/html', readFileSync(path.join(outDir, BUNDLE_HTML), 'utf8'));
      return;
    }
    const html = await server.transformIndexHtml(req.url ?? url.pathname, componentPageHtml(key, variant, key + ' — ' + (found.payload.label ?? variant)));
    sendText(res, 200, 'text/html', html);
  };

  const routes = (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const url = new URL(req.url ?? '/', 'http://lam.local');
    const route = url.pathname === '/@lam/state' ? handleState(url, res) : url.pathname === '/@lam/component' ? handleComponent(req, url, res) : null;
    if (route === null) {
      next();
      return;
    }
    route.catch((e: unknown) => sendText(res, 500, 'text/plain', 'Live App Map: ' + (e instanceof Error ? e.stack ?? e.message : String(e))));
  };

  return {
    name: 'live-app-map',
    config(_cfg, env) {
      isPreview = env.isPreview === true;
    },
    configResolved(config: ResolvedConfig) {
      const mapBuild = config.plugins.some((p) => p.name === MAP_BUILD_PLUGIN);
      mode = config.command === 'serve' && !isPreview ? 'dev' : !mapBuild ? 'off' : config.command === 'build' ? 'map-build' : 'map-preview';
      outDir = path.resolve(config.root, config.build.outDir);
      if (mode === 'off') {
        return;
      }
      if (opts.projectDir !== undefined) {
        const dir = path.resolve(config.root, opts.projectDir);
        projectDir = existsSync(path.join(dir, LAM_DIR, 'states.ts')) ? dir : null;
      } else {
        projectDir = findProjectDir(config.root, existsSync, path.join, path.dirname);
      }
      if (projectDir === null) {
        config.logger.warn(missing());
      }
    },
    configureServer(s) {
      if (mode !== 'dev') {
        return;
      }
      server = s;
      s.middlewares.use(routes);
    },
    configurePreviewServer(s) {
      if (mode === 'map-preview') {
        s.middlewares.use(routes);
      }
    },
    async buildStart() {
      const file = statesFile();
      if (mode !== 'map-build' || file === null || projectDir === null) {
        return;
      }
      const dir = projectDir;
      const mod = await importStates(file);
      const components = Object.keys(mod.components ?? {}).flatMap((key) => {
        const ref = parseExportRef(key);
        return ref === null ? [] : [{ key, file: path.join(dir, ref.file), name: ref.name }];
      });
      bundled = { statesFile: file, components, wrapper: wrapperRef(), styles: (opts.styles ?? []).map((s) => path.join(dir, s)) };
      this.addWatchFile(file);
      this.emitFile({ type: 'chunk', id: BUNDLE_ID, name: BUNDLE_NAME });
    },
    resolveId(id) {
      if (id === BUNDLE_ID) {
        return BUNDLE_ID;
      }
      return id.indexOf(ENTRY_PATH) === 0 ? ENTRY_ID + id.slice(ENTRY_PATH.length) : null;
    },
    load(id) {
      if (id === BUNDLE_ID) {
        return bundled === null ? null : componentsBundleCode(bundled);
      }
      if (id.indexOf(ENTRY_ID) !== 0 || server === null || projectDir === null) {
        return null;
      }
      const q = new URLSearchParams(id.slice(ENTRY_ID.length).replace(/^\?/, ''));
      const key = q.get('key') ?? '';
      const ref = parseExportRef(key);
      if (ref === null) {
        throw new Error('Live App Map: ключ компонента «' + key + '» не в формате <файл>#<экспорт>');
      }
      const dir = projectDir;
      return componentEntryCode({
        statesFile: path.join(dir, LAM_DIR, 'states.ts'),
        componentFile: path.join(dir, ref.file),
        exportName: ref.name,
        key,
        variant: q.get('variant') ?? '',
        wrapper: wrapperRef(),
        styles: (opts.styles ?? []).map((s) => path.join(dir, s)),
      });
    },
    generateBundle(_out, bundle) {
      if (mode !== 'map-build') {
        return;
      }
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry && chunk.name === BUNDLE_NAME) {
          const css = [...(chunk.viteMetadata?.importedCss ?? [])];
          const runtime = lamRuntimeScript(LAM_STATE_PARAM) + reloadScript(1000);
          this.emitFile({ type: 'asset', fileName: BUNDLE_HTML, source: componentsBundleHtml(runtime, chunk.fileName, css) });
        }
      }
    },
    transformIndexHtml: {
      order: 'pre',
      handler() {
        if (mode !== 'dev' && mode !== 'map-build') {
          return [];
        }
        return [{ tag: 'script', children: lamRuntimeScript(LAM_STATE_PARAM), injectTo: 'head-prepend' }];
      },
    },
  };
}
