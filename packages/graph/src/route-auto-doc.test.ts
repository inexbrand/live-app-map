/**
 * Автоописание роута и причина «без экранов» на данных настоящего сканера
 * (fixtures/source-monorepo с экранами Next и React Router).
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { scanSource } from '@live-app-map/scanner-source';
import type { ApiRoute, AppMapDocument, CodeModel } from '@live-app-map/schema';
import { AUTO_DOC_NOTE, apiCoverage, buildCodeIndex, routeAutoDoc, routeScreenGap, type CodeIndex } from './index';

const FIXTURE = path.resolve(import.meta.dir, '../../../fixtures/source-monorepo');

let code: CodeModel;
let index: CodeIndex;

beforeAll(() => {
  code = scanSource({
    root: FIXTURE,
    entries: [
      { file: 'apps/web/src/app/users/page.tsx' },
      { file: 'apps/web/src/app/orders/page.tsx' },
      { file: 'apps/miniapp/src/routes.tsx', nodeId: 'route:/profile/:id', routePath: '/profile/:id' },
    ],
  }).code;
  const doc: AppMapDocument = {
    formatVersion: 2,
    kind: 'live-app-map',
    generatedAt: '2026-01-01T00:00:00.000Z',
    generator: { name: 'test', version: '0' },
    revision: 'r',
    project: { root: FIXTURE, framework: 'next' },
    baseUrl: null,
    nodes: [],
    edges: [],
    code,
  };
  index = buildCodeIndex(doc);
});

function route(method: string, routePath: string): ApiRoute {
  const r = code.routes.find((x) => x.method === method && x.path === routePath);
  if (r === undefined) {
    throw new Error(`нет роута ${method} ${routePath}`);
  }
  return r;
}

describe('routeAutoDoc', () => {
  test('действие, таблицы и ответ в краткой строке; разделы — строками', () => {
    const auto = routeAutoDoc(index, route('GET', '/api/users/:id'));
    expect(auto.summary).toBe('Чтение «users» по id; читает users; ответ {error}');
    expect(auto.lines.map((l) => l.label)).toEqual(['Обработчик', 'Читает', 'Ответ']);
    expect(auto.lines.find((l) => l.label === 'Ответ')?.text).toBe('поля error; возвращает user; статусы 404');
    expect(auto.facts).toBe(2);
  });

  test('запись: пишет таблицы, именованный обработчик с местом', () => {
    const auto = routeAutoDoc(index, route('POST', '/users'));
    expect(auto.summary).toBe('Запись «users»; пишет users');
    expect(auto.lines[0]).toEqual({ label: 'Обработчик', text: 'createUser · apps/api/src/users.ts:43' });
  });

  test('пометка автоописания — одна для всех видов', () => {
    expect(AUTO_DOC_NOTE).toBe('описание собрано из кода');
  });
});

describe('routeScreenGap', () => {
  test('роут с экранами — причины нет', () => {
    expect(routeScreenGap(index, route('GET', '/api/users'))).toBeUndefined();
  });

  test('вызов только из скрипта — не из экранов', () => {
    const gap = routeScreenGap(index, route('DELETE', '/orders/:id'));
    expect(gap?.kind).toBe('other-client');
    expect(gap?.files).toEqual(['scripts/cleanup.ts']);
  });

  test('вызов в приложении с экранами, но ни один экран не доходит', () => {
    const gap = routeScreenGap(index, route('GET', '/api/admin/tags'));
    expect(gap?.kind).toBe('unreached');
    expect(gap?.files).toEqual(['apps/miniapp/src/stores/legacy.ts']);
  });

  test('никто не вызывает: вид по пути — вебхук, бот, служебный', () => {
    expect(routeScreenGap(index, route('GET', '/api/admin/colors'))?.kind).toBe('no-caller');
    const base = route('GET', '/api/admin/colors');
    const as = (p: string): string | undefined => routeScreenGap(index, { ...base, id: `x ${p}`, path: p })?.text;
    expect(as('/api/payments/webhook')).toStartWith('вебхук');
    expect(as('/bot/updates')).toStartWith('бот');
    expect(as('/health')).toStartWith('служебный');
  });

  test('покрытие считает автоописания и причины', () => {
    const c = apiCoverage(index);
    expect(c.autoDescribed).toBe(code.routes.filter((r) => routeAutoDoc(index, r).facts > 0).length);
    expect(c.gaps.unreached + c.gaps.otherClient + c.gaps.noCaller + c.withScreens).toBe(c.routes);
    expect(c.gaps.otherClient).toBeGreaterThanOrEqual(1);
    expect(c.gaps.unreached).toBeGreaterThanOrEqual(1);
  });
});
