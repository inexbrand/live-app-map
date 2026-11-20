/**
 * formatVersion 2: раздел code, апгрейд v1 → v2, перенос code через viewer-формат.
 */
import { describe, expect, test } from 'bun:test';
import {
  appMapToLiveAppMap,
  FORMAT_VERSION,
  liveAppMapToAppMap,
  parseAppMapDocument,
  parseLiveAppMapDocument,
  type CodeModel,
} from './index';

const code: CodeModel = {
  root: '/repo',
  services: [{ id: 'service:api', name: 'api', root: 'apps/api' }],
  symbols: [
    {
      id: 'symbol:apps/api/src/users.ts#listUsers',
      kind: 'function',
      name: 'listUsers',
      serviceId: 'service:api',
      location: { file: 'apps/api/src/users.ts', line: 4 },
      doc: 'Список пользователей.',
      signature: '() => Promise<User[]>',
    },
  ],
  routes: [
    {
      id: 'route:GET /users',
      framework: 'elysia',
      method: 'GET',
      path: '/users',
      serviceId: 'service:api',
      location: { file: 'apps/api/src/users.ts', line: 10 },
      handler: { location: { file: 'apps/api/src/users.ts', line: 10 } },
      doc: 'Отдаёт список пользователей.',
      dbCalls: [
        {
          orm: 'drizzle',
          operation: 'select',
          table: 'users',
          location: { file: 'apps/api/src/users.ts', line: 11 },
        },
      ],
    },
  ],
  tables: [
    {
      id: 'table:users',
      orm: 'drizzle',
      name: 'users',
      exportName: 'users',
      serviceId: 'service:api',
      location: { file: 'apps/api/src/schema.ts', line: 3 },
      columns: [{ name: 'id', type: 'uuid' }],
    },
  ],
};

/** Документ v1 в том виде, в каком его писали старые сканеры. */
function v1Document(): Record<string, unknown> {
  return {
    formatVersion: 1,
    kind: 'live-app-map',
    generatedAt: '2026-01-01T00:00:00.000Z',
    generator: { name: 'test', version: '0.0.0' },
    revision: 'r1',
    project: { root: '.', framework: 'next' },
    baseUrl: null,
    nodes: [{ id: 'route:/', kind: 'page', title: 'Главная', pathPattern: '/' }],
    edges: [],
  };
}

describe('formatVersion 2', () => {
  test('текущая версия формата — 2', () => {
    expect(FORMAT_VERSION).toBe(2);
  });

  test('документ v1 читается и поднимается до v2 без раздела code', () => {
    const res = parseAppMapDocument(v1Document());
    if (!res.ok) {
      throw new Error(res.errors.map((e) => e.message).join('\n'));
    }
    expect(res.document.formatVersion).toBe(2);
    expect(res.document.code).toBeUndefined();
    expect(res.document.nodes[0]?.id).toBe('route:/');
  });

  test('документ v2 с разделом code и нодой service проходит границу', () => {
    const raw = {
      ...v1Document(),
      formatVersion: 2,
      nodes: [
        { id: 'service:api', kind: 'service', title: 'api', pathPattern: 'apps/api' },
      ],
      code,
    };
    const res = parseAppMapDocument(raw);
    if (!res.ok) {
      throw new Error(res.errors.map((e) => e.message).join('\n'));
    }
    expect(res.document.code?.routes[0]?.dbCalls[0]?.table).toBe('users');
    expect(res.document.nodes[0]?.kind).toBe('service');
  });

  test('неизвестный метод роута отклоняется на границе', () => {
    const bad = {
      ...v1Document(),
      formatVersion: 2,
      code: { ...code, routes: [{ ...code.routes[0], method: 'FETCH' }] },
    };
    const res = parseAppMapDocument(bad);
    expect(res.ok).toBe(false);
  });

  test('неизвестная версия формата отклоняется', () => {
    const res = parseAppMapDocument({ ...v1Document(), formatVersion: 3 });
    expect(res.ok).toBe(false);
  });

  test('code и сервисы переживают конверт enterprise → viewer → enterprise', () => {
    const parsed = parseAppMapDocument({
      ...v1Document(),
      formatVersion: 2,
      nodes: [
        { id: 'route:/', kind: 'page', title: 'Главная', pathPattern: '/' },
        { id: 'service:api', kind: 'service', title: 'api', pathPattern: 'apps/api' },
      ],
      code,
    });
    if (!parsed.ok) {
      throw new Error('fixture invalid');
    }
    const live = appMapToLiveAppMap(parsed.document);
    const liveParsed = parseLiveAppMapDocument(JSON.parse(JSON.stringify(live)));
    if (!liveParsed.ok) {
      throw new Error(liveParsed.errors.map((e) => e.message).join('\n'));
    }
    const back = liveAppMapToAppMap(liveParsed.document);
    expect(back.code).toEqual(code);
    const service = back.nodes.find((n) => n.id === 'service:api');
    expect(service?.kind).toBe('service');
    expect(service?.iframePolicy?.enabled).toBe(false);
  });
});
