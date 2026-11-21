/**
 * Раздел docs и вход/доступ роута: проходят границу и переживают конверт в viewer-формат и обратно.
 */
import { describe, expect, test } from 'bun:test';
import {
  appMapToLiveAppMap,
  liveAppMapToAppMap,
  parseAppMapDocument,
  parseLiveAppMapDocument,
  type DocsModel,
} from './index';

const docs: DocsModel = {
  root: '/repo',
  epochs: [
    {
      id: 'api-docs-views#20261121-205636',
      slug: 'api-docs-views',
      date: '2026-11-21T20:56:36',
      dir: 'docs/epoch/api-docs-views#20261121-205636',
      summary: 'Виды API и документации',
      declaredStatus: 'research',
      readiness: 'not-ready',
      openBugs: ['картинка не грузится'],
      files: [{ path: 'docs/epoch/api-docs-views#20261121-205636/09-bugs.md', title: 'Баги', text: '## Open\n- картинка не грузится' }],
      images: ['docs/epoch/api-docs-views#20261121-205636/screens/a.png'],
    },
  ],
  notes: [{ path: 'docs/agent-notes/db.md', title: 'БД', text: '# БД' }],
  guides: [{ path: 'README.md', title: 'Readme', text: '# Readme' }],
};

function doc(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    formatVersion: 2,
    kind: 'live-app-map',
    generatedAt: '2026-01-01T00:00:00.000Z',
    generator: { name: 'test', version: '0.0.0' },
    revision: 'r1',
    project: { root: '/repo', framework: 'next' },
    baseUrl: null,
    nodes: [{ id: 'route:/', kind: 'page', title: 'Главная', pathPattern: '/' }],
    edges: [],
    ...extra,
  };
}

const route = {
  id: 'api:api POST /users',
  framework: 'elysia',
  method: 'POST',
  path: '/users',
  serviceId: 'service:api',
  location: { file: 'apps/api/src/users.ts', line: 10 },
  handler: { location: { file: 'apps/api/src/users.ts', line: 10 } },
  dbCalls: [],
  input: { body: { kind: 'typebox', name: 'CreateUser', fields: [{ name: 'email', type: 'string' }, { name: 'age', type: 'number', optional: true }] } },
  access: { auth: true, roles: ['admin'], permissions: ['users.write'], checks: ['requireAdmin'] },
};
const code = { root: '/repo', services: [{ id: 'service:api', name: 'api', root: 'apps/api' }], symbols: [], routes: [route], tables: [] };

describe('раздел docs', () => {
  test('docs, вход и доступ роута переживают enterprise → viewer → enterprise', () => {
    const parsed = parseAppMapDocument(doc({ docs, code }));
    if (!parsed.ok) {
      throw new Error(parsed.errors.map((e) => e.message).join('\n'));
    }
    const live = parseLiveAppMapDocument(JSON.parse(JSON.stringify(appMapToLiveAppMap(parsed.document))));
    if (!live.ok) {
      throw new Error(live.errors.map((e) => e.message).join('\n'));
    }
    const back = liveAppMapToAppMap(live.document);
    expect(back.docs).toEqual(docs);
    expect(back.code?.routes[0]?.input?.body?.fields.map((f) => f.name)).toEqual(['email', 'age']);
    expect(back.code?.routes[0]?.access?.roles).toEqual(['admin']);
  });

  test('неизвестная готовность эпохи отклоняется на границе', () => {
    const bad = { ...docs, epochs: [{ ...docs.epochs[0], readiness: 'maybe' }] };
    expect(parseAppMapDocument(doc({ docs: bad })).ok).toBe(false);
  });

  test('неизвестный вид схемы входа отклоняется на границе', () => {
    const bad = { ...code, routes: [{ ...route, input: { body: { kind: 'yup', fields: [] } } }] };
    expect(parseAppMapDocument(doc({ code: bad })).ok).toBe(false);
  });
});
