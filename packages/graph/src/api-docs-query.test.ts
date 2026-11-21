/**
 * Архитектура API и документы на данных настоящих сканеров: код фикстуры
 * fixtures/source-guarded и документы временного проекта.
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanDocs } from '@live-app-map/scanner-docs';
import { scanSource } from '@live-app-map/scanner-source';
import type { AppMapDocument, CodeModel, DocsModel } from '@live-app-map/schema';
import {
  apiArchitecture,
  apiCoverage,
  buildCodeIndex,
  buildDocRefIndex,
  epochList,
  filterRoutes,
  findEpoch,
  resolveDocRef,
  routeGroupKey,
  searchDocs,
  type CodeIndex,
  type DocRefIndex,
} from './index';

const FIXTURE = path.resolve(import.meta.dir, '../../../fixtures/source-guarded');

let code: CodeModel;
let index: CodeIndex;
let docs: DocsModel;
let refs: DocRefIndex;

function put(root: string, file: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

beforeAll(() => {
  code = scanSource({ root: FIXTURE }).code;
  const doc: AppMapDocument = {
    formatVersion: 2,
    kind: 'live-app-map',
    generatedAt: '2026-01-01T00:00:00.000Z',
    generator: { name: 'test', version: '0' },
    revision: 'r',
    project: { root: FIXTURE, framework: 'next' },
    baseUrl: null,
    nodes: [
      { id: 'route:/vacancies/[id]', kind: 'page', title: 'Вакансия', pathPattern: '/vacancies/[id]', source: { file: 'apps/web/page.tsx' } },
    ],
    edges: [],
    code,
  };
  index = buildCodeIndex(doc);
  refs = buildDocRefIndex(doc, index);
  const root = mkdtempSync(path.join(tmpdir(), 'lam-graph-docs-'));
  put(root, 'docs/epoch/api#20261121-100000/00-brief.md', '# Brief\n\n## Цель\n\nВид API для вакансий.');
  put(root, 'docs/epoch/api#20261121-100000/09-bugs.md', '## Open\n\n- нет схемы у POST /api/hono/items');
  put(root, 'docs/epoch/old#20250101-000000/09-bugs.md', '## Open\n\n(пусто)');
  put(root, 'docs/agent-notes/roles.md', '# Роли\n\nemployer видит только свои вакансии');
  docs = scanDocs(root);
});

describe('архитектура API', () => {
  test('ключ группы: /api/vN отбрасывается, параметры группу не образуют', () => {
    expect(routeGroupKey('/api/v1/admin/vacancies/:id')).toEqual({ base: '/api/v1', section: 'admin', module: 'vacancies' });
    expect(routeGroupKey('/api/me/:id')).toEqual({ base: '/api', section: 'me', module: '' });
    expect(routeGroupKey('/health')).toEqual({ base: '', section: 'health', module: '' });
  });

  test('сервис → разделы → модули с роутами фикстуры', () => {
    const [api] = apiArchitecture(index);
    expect(api?.service.name).toBe('@g/api');
    expect(api?.sections.map((s) => [s.prefix, s.count])).toEqual([
      ['/api/admin', 2],
      ['/api/hono', 1],
      ['/api/me', 1],
      ['/api/public', 1],
    ]);
    expect(api?.sections[0]?.modules.map((m) => [m.name, m.routes.map((r) => `${r.method} ${r.path}`)])).toEqual([
      ['reports', ['GET /api/admin/reports']],
      ['vacancies', ['POST /api/admin/vacancies']],
    ]);
  });

  test('фильтры: метод, «без описания», подстрока, неизвестный сервис', () => {
    expect(filterRoutes(index, { methods: ['POST'] }).map((r) => r.path)).toEqual(['/api/admin/vacancies', '/api/hono/items']);
    expect(filterRoutes(index, { undocumented: true }).map((r) => r.path).sort()).toEqual([
      '/api/admin/reports',
      '/api/hono/items',
      '/api/public/health',
    ]);
    expect(filterRoutes(index, { query: 'заказчика' }).map((r) => r.path)).toEqual(['/api/me/vacancies/:vacancyId']);
    expect(filterRoutes(index, { service: '@нет/такого' })).toEqual([]);
  });

  test('покрытие: описания, вход, доступ', () => {
    expect(apiCoverage(index)).toEqual({
      routes: 5,
      described: 2,
      // У /api/public/health нет ни входа, ни таблиц, ни доступа, ни ответа литералом.
      autoDescribed: 4,
      withInput: 3,
      withAccess: 3,
      withScreens: 0,
      gaps: { unreached: 0, otherClient: 0, noCaller: 5 },
    });
  });
});

describe('документы', () => {
  test('эпохи: фильтр по готовности и подстроке, поиск по slug', () => {
    expect(epochList(docs, { readiness: 'not-ready' }).map((e) => e.id)).toEqual(['api#20261121-100000']);
    expect(epochList(docs, { query: 'вакансий' }).map((e) => e.slug)).toEqual(['api']);
    expect(findEpoch(docs, 'old')?.readiness).toBe('ready');
  });

  test('поиск по тексту: файл, строка, эпоха', () => {
    const hits = searchDocs(docs, 'employer');
    expect(hits).toEqual([{ path: 'docs/agent-notes/roles.md', title: 'Роли', line: 3, snippet: 'employer видит только свои вакансии' }]);
    expect(searchDocs(docs, 'POST /api/hono')[0]?.epochId).toBe('api#20261121-100000');
  });

  test('ссылки из текста: роут по методу и пути, путь с другими именами параметров, экран, файл:строка', () => {
    expect(resolveDocRef('POST /api/hono/items', refs)).toEqual({ kind: 'route', routeId: 'api:@g/api POST /api/hono/items' });
    expect(resolveDocRef('/api/me/vacancies/{id}', refs)).toEqual({ kind: 'route', routeId: 'api:@g/api GET /api/me/vacancies/:vacancyId' });
    expect(resolveDocRef('/vacancies/:id', refs)).toEqual({ kind: 'screen', nodeId: 'route:/vacancies/[id]' });
    const health = code.routes.find((r) => r.path === '/api/public/health');
    if (health === undefined) {
      throw new Error('нет роута /api/public/health в фикстуре');
    }
    expect(resolveDocRef(`guarded.ts:${health.location.line}`, refs)).toEqual({ kind: 'route', routeId: health.id });
    expect(resolveDocRef('apps/api/src/guarded.ts', refs)).toEqual({ kind: 'file', file: 'apps/api/src/guarded.ts' });
    expect(resolveDocRef('просто текст', refs)).toBeUndefined();
    expect(resolveDocRef('DELETE /api/hono/items', refs)).toBeUndefined();
  });
});
