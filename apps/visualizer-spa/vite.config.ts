/**
 * Vite SPA :4310 + TLS dogfood proxy (self-signed miniapp) + dynamic /maps catalog +
 * проект (LAM_PROJECT): его карта в каталоге и GET /__lam_project/states.
 */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, PreviewServer, ProxyOptions } from 'vite';
import { defineConfig } from 'vite';
import { writeMapCatalogIndex } from './src/lib/build-map-catalog-fs';
import { errorReportsMiddleware } from './src/lib/error-reports-middleware';
import { docsAssetMiddleware } from './src/lib/docs-asset-middleware';
import { monorepoScanRecipes } from './src/lib/map-scan-recipes';
import { mapVersionsMiddleware } from './src/lib/map-versions-middleware';
import { docsWriteMiddleware } from './src/lib/docs-write-middleware';
import { agentStateMiddleware } from './src/lib/agent-state-middleware';
import { commentsMiddleware } from './src/lib/comments-middleware';
import { modelsMiddleware } from './src/lib/voice/models-middleware';
import { mcpAgentMiddleware } from './src/lib/mcp-middleware';
import { httpsPathProxyMiddleware } from './src/lib/https-path-proxy';
import { attachFrameBypass, stripProxyPrefix } from './src/lib/frame-bypass';
import { mapsIndexMiddleware } from './src/lib/maps-index-middleware';
import { tlsCheckMiddleware } from './src/lib/tls-check-middleware';
import { lamGatewayPlugin } from './src/lib/gateway/vite-plugin';
import { lamStreamPlugin } from './src/lib/stream/stream-plugin';
import { openProject, projectCatalogExtra, projectMiddleware, type OpenProject } from './src/lib/project/project-server';

const spaRoot = path.dirname(fileURLToPath(import.meta.url));
const publicMapsDir = path.join(spaRoot, 'public', 'maps');
/** Корень монорепо: scripts/ и packages/ для свежего скана карт. */
const monorepoRoot = path.resolve(spaRoot, '../..');

/** Открытый проект (`bun run dev -- --project <каталог>` / LAM_PROJECT) или null. */
const project: OpenProject | null = await openProject(process.env, process.cwd());

/** Карта проекта для версий и свежего скана: id → файл. */
const projectMapFiles = new Map(project === null ? [] : [[project.name, project.mapFile]]);

/** REST визуализатора: одинаково у dev-сервера и у прод-сборки (vite preview). */
function mountApi(server: Pick<PreviewServer, 'middlewares'>): void {
  server.middlewares.use(projectMiddleware(project));
  server.middlewares.use(httpsPathProxyMiddleware);
  server.middlewares.use(errorReportsMiddleware);
  server.middlewares.use(agentStateMiddleware);
  server.middlewares.use(commentsMiddleware);
  server.middlewares.use(modelsMiddleware);
  server.middlewares.use(mcpAgentMiddleware);
  server.middlewares.use(docsAssetMiddleware);
  server.middlewares.use(mapVersionsMiddleware(publicMapsDir, monorepoScanRecipes(monorepoRoot, project), projectMapFiles));
  server.middlewares.use(docsWriteMiddleware);
  server.middlewares.use(tlsCheckMiddleware);
}

/**
 * REST визуализатора: отчёты об ошибках, замечания, модели голоса, агент, документы, версии карт.
 */
function errorReportsPlugin(): Plugin {
  return {
    name: 'lam-error-reports',
    configureServer: mountApi,
    configurePreviewServer: mountApi,
  };
}

/**
 * Динамический каталог: GET /maps/index.json из файлов public/maps/*.liveappmap.json.
 * Без хардкода продукта — любая карта в папке появляется в UI.
 */
function mapsCatalogPlugin(): Plugin {
  return {
    name: 'live-app-map-catalog',
    buildStart() {
      writeMapCatalogIndex(publicMapsDir);
    },
    configureServer(server) {
      server.middlewares.use(mapsIndexMiddleware(publicMapsDir, () => projectCatalogExtra(project)));
    },
    configurePreviewServer(server) {
      server.middlewares.use(mapsIndexMiddleware(publicMapsDir, () => projectCatalogExtra(project)));
    },
  };
}

/** Path-proxy поверхности: префикс снимается, ответ переписывается под iframe. */
function surfaceProxy(name: string, target: string, secure?: boolean): ProxyOptions {
  const prefix = `/__lam_proxy/${name}`;
  return {
    target,
    changeOrigin: true,
    ...(secure === undefined ? {} : { secure }),
    ws: true,
    selfHandleResponse: true,
    rewrite: (p) => stripProxyPrefix(p, prefix),
    configure: (proxy) => {
      attachFrameBypass(proxy, name, prefix);
    },
  };
}

/** Miniapp/site path-proxy + asset rewrite. Admin — direct (no path proxy). */
function surfaceProxies(): Record<string, ProxyOptions> {
  return {
    '/__lam_proxy/miniapp': surfaceProxy('miniapp', 'https://vite.localhost:5175', false),
    // legacy bookmark / stale maps: still proxy admin but WITH asset rewrite
    '/__lam_proxy/admin': surfaceProxy('admin', 'http://localhost:16002'),
    '/__lam_proxy/site': surfaceProxy('site', 'http://localhost:16001'),
    // '/__lam_proxy/https/<host:port>' — httpsPathProxyMiddleware (цель по запросу)
  };
}

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(spaRoot, 'src') },
  },
  plugins: [
    react(),
    tailwindcss(),
    mapsCatalogPlugin(),
    errorReportsPlugin(),
    lamGatewayPlugin(),
    lamStreamPlugin(),
  ],
  server: { port: 4310, host: true, proxy: surfaceProxies() },
  // Прод-сборка (bun run start): тот же порт и прокси, что у dev
  preview: { port: 4310, host: true, proxy: surfaceProxies() },
  optimizeDeps: {
    // transformers импортирует только воркер голоса: без include Vite находит его при первой
    // записи голоса и перезагружает страницу посреди работы (и e2e)
    include: ['@xyflow/react', 'zustand', '@dagrejs/dagre', '@huggingface/transformers'],
  },
});
