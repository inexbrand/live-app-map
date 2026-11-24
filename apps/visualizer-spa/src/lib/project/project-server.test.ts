/**
 * Проект на dev-сервере: открытие по LAM_PROJECT (настоящий config.ts), карта в каталоге,
 * состояния states.ts через настоящий HTTP-сервер и перечитывание при правке файла.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serveMiddleware } from '../dev-http.test-helpers';
import { mapsIndexMiddleware } from '../maps-index-middleware';
import { PROJECT_MAP_PATH, PROJECT_STATES_PATH, openProject, projectCatalogExtra, projectMiddleware, readProjectStates } from './project-server';

const tmp = mkdtempSync(path.join(tmpdir(), 'lam-project-srv-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** Проект с config.ts (и, если задано, map.json и states.ts). */
function makeProject(name: string, files: { readonly map?: unknown; readonly states?: string } = {}): string {
  const root = path.join(tmp, name);
  mkdirSync(path.join(root, 'apps/web'), { recursive: true });
  mkdirSync(path.join(root, '.live-app-map'), { recursive: true });
  writeFileSync(
    path.join(root, '.live-app-map/config.ts'),
    `import type { LamProjectConfig } from '@live-app-map/sdk';\nexport const config: LamProjectConfig = { name: '${name}', apps: [{ id: 'web', label: 'Веб', dir: 'apps/web', baseUrl: 'http://localhost:5173' }] };\n`,
  );
  if (files.map !== undefined) {
    writeFileSync(path.join(root, '.live-app-map/map.json'), JSON.stringify(files.map));
  }
  if (files.states !== undefined) {
    writeFileSync(path.join(root, '.live-app-map/states.ts'), files.states);
  }
  return root;
}

const MAP = {
  version: '1.0',
  baseUrl: 'http://localhost:5173',
  app: { name: 'demo' },
  pages: [
    { id: 'web:route:/', title: 'Главная', path: '/', group: 'web' },
    { id: 'service:api', title: 'api', path: 'apps/api', type: 'service', metadata: { kind: 'service', pathPattern: 'apps/api' }, iframeDisabled: true },
  ],
  edges: [],
};

describe('openProject', () => {
  test('нет LAM_PROJECT — null; путь от cwd; имя из config.ts', async () => {
    expect(await openProject({}, tmp)).toBeNull();
    expect(await openProject({ LAM_PROJECT: ' ' }, tmp)).toBeNull();
    const root = makeProject('demo');
    const p = await openProject({ LAM_PROJECT: 'demo' }, tmp);
    expect(p).toEqual({ root, name: 'demo', mapFile: path.join(root, '.live-app-map/map.json'), statesFile: path.join(root, '.live-app-map/states.ts') });
  });

  test('нет каталога или config.ts — ошибка с подсказкой', async () => {
    await expect(openProject({ LAM_PROJECT: 'нет' }, tmp)).rejects.toThrow('LAM_PROJECT=нет: каталога');
    mkdirSync(path.join(tmp, 'bare'));
    await expect(openProject({ LAM_PROJECT: 'bare' }, tmp)).rejects.toThrow('config.ts: создайте его');
  });
});

describe('карта проекта в каталоге', () => {
  test('есть map.json — запись первой (id и подпись — имя проекта, экраны без сервисов); нет — пропуск с командой скана', async () => {
    const withMap = await openProject({ LAM_PROJECT: makeProject('mapped', { map: MAP }) }, tmp);
    const mapsDir = path.join(tmp, 'public-maps');
    mkdirSync(mapsDir);
    writeFileSync(path.join(mapsDir, 'self.liveappmap.json'), JSON.stringify({ ...MAP, app: { name: 'self' } }));
    const server = await serveMiddleware(mapsIndexMiddleware(mapsDir, () => projectCatalogExtra(withMap)));
    try {
      const body: unknown = await (await fetch(`${server.url}/maps/index.json`)).json();
      expect(body).toMatchObject({
        maps: [
          { id: 'mapped', label: 'mapped', path: PROJECT_MAP_PATH, baseUrl: 'http://localhost:5173', pageCount: 1 },
          { id: 'self', label: 'self', path: '/maps/self.liveappmap.json' },
        ],
        skipped: [],
      });
    } finally {
      await server.close();
    }
    const noMap = await openProject({ LAM_PROJECT: makeProject('nomap') }, tmp);
    expect(projectCatalogExtra(noMap).skipped[0]?.reason).toContain('bun run scan -- --project');
    expect(projectCatalogExtra(null)).toEqual({ maps: [], skipped: [] });
  });
});

describe('GET /__lam_project/*', () => {
  test('проект не открыт — 404 с подсказкой, чужие пути — дальше', async () => {
    const server = await serveMiddleware(projectMiddleware(null));
    try {
      const res = await fetch(`${server.url}${PROJECT_STATES_PATH}`);
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: string }).error).toContain('--project');
      expect(await (await fetch(`${server.url}/other`)).text()).toBe('next');
    } finally {
      await server.close();
    }
  });

  test('состояния — экспорты states.ts как есть; правка файла видна без перезапуска; map.json отдаётся', async () => {
    const root = makeProject('states', {
      map: MAP,
      states: "export const screens = { 'web:route:/': [{ id: 'empty', label: 'Пусто', kind: 'empty' }] };\nexport const components = {};\n",
    });
    const project = await openProject({ LAM_PROJECT: root }, tmp);
    const server = await serveMiddleware(projectMiddleware(project));
    try {
      const first: unknown = await (await fetch(`${server.url}${PROJECT_STATES_PATH}`)).json();
      expect(first).toEqual({ screens: { 'web:route:/': [{ id: 'empty', label: 'Пусто', kind: 'empty' }] }, components: {} });
      const file = path.join(root, '.live-app-map/states.ts');
      writeFileSync(file, "export const components = { 'apps/web/src/B.tsx#B': [{ id: 'a', label: 'A' }] };\n");
      const later = new Date(Date.now() + 5000);
      utimesSync(file, later, later);
      const second: unknown = await (await fetch(`${server.url}${PROJECT_STATES_PATH}`)).json();
      expect(second).toEqual({ screens: {}, components: { 'apps/web/src/B.tsx#B': [{ id: 'a', label: 'A' }] } });
      const map = await fetch(`${server.url}${PROJECT_MAP_PATH}`);
      expect([map.status, map.headers.get('cache-control')]).toEqual([200, 'no-store']);
      expect(await map.json()).toEqual(MAP);
    } finally {
      await server.close();
    }
  });

  test('нет states.ts — пустые объекты; states.ts с ошибкой — 500 с путём файла; нет map.json — 404', async () => {
    const root = makeProject('broken');
    const project = await openProject({ LAM_PROJECT: root }, tmp);
    const server = await serveMiddleware(projectMiddleware(project));
    try {
      expect(await (await fetch(`${server.url}${PROJECT_STATES_PATH}`)).json()).toEqual({ screens: {}, components: {} });
      expect((await fetch(`${server.url}${PROJECT_MAP_PATH}`)).status).toBe(404);
      writeFileSync(path.join(root, '.live-app-map/states.ts'), 'export const screens = ;\n');
      const res = await fetch(`${server.url}${PROJECT_STATES_PATH}`);
      expect(res.status).toBe(500);
      expect(((await res.json()) as { error: string }).error).toContain('states.ts');
    } finally {
      await server.close();
    }
  });

  test('readProjectStates: нет экспорта — пустой объект', async () => {
    const root = makeProject('partial', { states: "export const screens = { a: [] };\n" });
    expect(await readProjectStates(path.join(root, '.live-app-map/states.ts'))).toEqual({ screens: { a: [] }, components: {} });
  });
});
