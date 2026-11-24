/**
 * Dev-only плагин Vite: рантайм Live App Map в странице, описание состояний
 * (GET /@lam/state) и страница отдельного компонента (GET /@lam/component).
 * `apply: 'serve'` — в `vite build` плагин не участвует, в production ничего не попадает.
 */
import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
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

/**
 * Плагин Vite Live App Map (только dev-сервер).
 *
 * @param opts - папка проекта, обёртка и стили страницы компонента
 */
export function lamVite(opts: LamViteOptions = {}): Plugin {
  let projectDir: string | null = null;
  let server: ViteDevServer | null = null;

  const statesFile = (): string | null => (projectDir === null ? null : path.join(projectDir, LAM_DIR, 'states.ts'));
  const missing = (): string =>
    'Live App Map: не найден ' + LAM_DIR + '/states.ts (искали вверх от root Vite' + (opts.projectDir !== undefined ? ' и в ' + opts.projectDir : '') + '). ' +
    'Создайте его: export const screens = {…}; export const components = {…} — или укажите lamVite({ projectDir }).';

  const loadStates = async (s: ViteDevServer, file: string): Promise<LamStatesModule> => {
    const id = file.replace(/\\/g, '/');
    const cached = s.moduleGraph.getModuleById(id);
    if (cached !== undefined) {
      s.moduleGraph.invalidateModule(cached);
    }
    return (await s.ssrLoadModule(id)) as LamStatesModule;
  };

  const handleState = async (s: ViteDevServer, url: URL, res: ServerResponse): Promise<void> => {
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
    const found = lookupState(await loadStates(s, file), id, file);
    if (found.ok) {
      sendText(res, 200, 'application/json', JSON.stringify(found.payload));
    } else {
      sendText(res, 404, 'text/plain', found.error);
    }
  };

  const handleComponent = async (s: ViteDevServer, req: IncomingMessage, url: URL, res: ServerResponse): Promise<void> => {
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
    const found = lookupState(await loadStates(s, file), 'component:' + key + '/' + variant, file);
    if (!found.ok) {
      sendText(res, 404, 'text/plain', found.error);
      return;
    }
    const html = await s.transformIndexHtml(req.url ?? url.pathname, componentPageHtml(key, variant, key + ' — ' + (found.payload.label ?? variant)));
    sendText(res, 200, 'text/html', html);
  };

  return {
    name: 'live-app-map',
    apply: 'serve',
    configResolved(config) {
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
      server = s;
      s.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://lam.local');
        const route = url.pathname === '/@lam/state' ? handleState(s, url, res) : url.pathname === '/@lam/component' ? handleComponent(s, req, url, res) : null;
        if (route === null) {
          next();
          return;
        }
        route.catch((e: unknown) => sendText(res, 500, 'text/plain', 'Live App Map: ' + (e instanceof Error ? e.stack ?? e.message : String(e))));
      });
    },
    resolveId(id) {
      return id.indexOf(ENTRY_PATH) === 0 ? ENTRY_ID + id.slice(ENTRY_PATH.length) : null;
    },
    load(id) {
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
      const wrapper = opts.wrapper === undefined ? null : parseExportRef(opts.wrapper);
      if (opts.wrapper !== undefined && wrapper === null) {
        throw new Error('Live App Map: опция wrapper «' + opts.wrapper + '» не в формате <файл от корня проекта>#<экспорт>');
      }
      return componentEntryCode({
        statesFile: path.join(dir, LAM_DIR, 'states.ts'),
        componentFile: path.join(dir, ref.file),
        exportName: ref.name,
        key,
        variant: q.get('variant') ?? '',
        wrapper: wrapper === null ? null : { file: path.join(dir, wrapper.file), name: wrapper.name },
        styles: (opts.styles ?? []).map((s) => path.join(dir, s)),
      });
    },
    transformIndexHtml: {
      order: 'pre',
      handler() {
        return [{ tag: 'script', children: lamRuntimeScript(LAM_STATE_PARAM), injectTo: 'head-prepend' }];
      },
    },
  };
}
