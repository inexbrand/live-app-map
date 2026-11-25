/**
 * Общее для тестов SDK: Vite dev-сервер фикстуры и headless Helium.
 */
import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { chromium, type Browser } from 'playwright-core';
import { createServer, type InlineConfig, type Plugin, type ViteDevServer } from 'vite';
import { lamVite } from '../src/vite';

/** Каталог фикстуры — маленькое React-приложение с .live-app-map/states.ts. */
export const FIXTURE = path.join(import.meta.dir, 'fixture');

/** Настоящий API фикстуры: то, что видно без подмены. */
export function fixtureApi(): Plugin {
  const api = (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const p = (req.url ?? '').split('?')[0];
    if (p === '/api/items') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify([{ id: 1, title: 'настоящая' }]));
      return;
    }
    if (p === '/api/items/7') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: 7 }));
      return;
    }
    next();
  };
  return {
    name: 'fixture-api',
    configureServer(s) {
      s.middlewares.use(api);
    },
    configurePreviewServer(s) {
      s.middlewares.use(api);
    },
  };
}

/** Конфиг Vite фикстуры: plugin-react, lamVite с обёрткой и стилями, API. */
export function fixtureConfig(extra: InlineConfig = {}): InlineConfig {
  return {
    root: FIXTURE,
    configFile: false,
    logLevel: 'error',
    // Кэш внутри node_modules: plugin-react не гоняет через Babel собранные зависимости
    cacheDir: path.join(FIXTURE, 'node_modules', '.vite-test'),
    plugins: [react(), lamVite({ wrapper: 'src/Frame.tsx#Frame', styles: ['src/card.css'] }), fixtureApi()],
    ...extra,
  };
}

/** Поднимает dev-сервер фикстуры на свободном порту. */
export async function startFixture(): Promise<{ readonly server: ViteDevServer; readonly base: string }> {
  const server = await createServer(fixtureConfig({ server: { port: 0, host: '127.0.0.1', strictPort: false } }));
  await server.listen();
  const addr = server.httpServer?.address();
  if (addr === null || addr === undefined || typeof addr === 'string') {
    throw new Error('Vite не дал порт');
  }
  return { server, base: 'http://127.0.0.1:' + addr.port };
}

/** Путь браузера: LAM_BROWSER_PATH, иначе установленный Helium. */
export function browserPath(): string {
  const fromEnv = process.env.LAM_BROWSER_PATH;
  if (fromEnv !== undefined && fromEnv !== '') {
    return fromEnv;
  }
  const local = process.env.LOCALAPPDATA;
  const helium = local === undefined ? '' : path.join(local, 'imput', 'Helium', 'Application', 'chrome.exe');
  if (helium === '' || !existsSync(helium)) {
    throw new Error('Нет браузера для теста: задайте LAM_BROWSER_PATH или установите Helium в %LOCALAPPDATA%\\imput\\Helium');
  }
  return helium;
}

/** Headless Helium. */
export function launchBrowser(): Promise<Browser> {
  return chromium.launch({ executablePath: browserPath(), headless: true });
}