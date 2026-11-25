/**
 * Скан проекта по .live-app-map/config.ts на реальных функциях: проверка конфига,
 * роли и параметры, страницы Payload (живой HTTP-сервер CMS), слияние приложений,
 * раздел code на фикстуре и полный скан временного проекта из фикстур.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FORMAT_VERSION, parseLiveAppMapJson, type AppMapDocument, type AppMapNode, type CodeModel, type CodeSymbol, type LiveAppMapDocument } from '@live-app-map/schema';
import { runScan } from '../index';
import { runCli } from '../commands';
import { exampleParamsFor, withRoleStates } from './app-enrich';
import { attachProjectCode, keptSymbols, surfaceCode } from './code';
import { checkProjectConfig, loadProjectConfig, projectFile } from './config';
import { mergeSurfaces, projectDocument } from './merge';
import { cmsPagesOf, fetchCmsPages, usesPayload, withPayloadPages } from './payload';
import { scanProject } from './scan-project';

const ROOT = path.resolve(import.meta.dir, '../../../..');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'lam-project-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function page(id: string, p: string, extra: Partial<AppMapNode> = {}): AppMapNode {
  return { id, kind: 'page', title: id, pathPattern: p, ...extra };
}

function appMap(nodes: AppMapNode[]): AppMapDocument {
  return {
    formatVersion: FORMAT_VERSION,
    kind: 'live-app-map',
    generatedAt: '2026-11-25T00:00:00.000Z',
    generator: { name: 'test', version: '0' },
    revision: 'r',
    project: { name: 'x', root: '/x', framework: 'next' },
    baseUrl: null,
    nodes,
    edges: [],
  };
}

/** Проект во временном каталоге: приложения — копии фикстур, config.ts — текст. */
function makeProject(name: string, config: string): string {
  const root = path.join(tmp, name);
  mkdirSync(path.join(root, 'apps'), { recursive: true });
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name, private: true, workspaces: ['apps/*'] }));
  cpSync(path.join(ROOT, 'fixtures/react-router-basic'), path.join(root, 'apps/web'), { recursive: true });
  cpSync(path.join(ROOT, 'fixtures/next-app-router-basic'), path.join(root, 'apps/site'), { recursive: true });
  writeFileSync(path.join(root, 'apps/site/package.json'), JSON.stringify({ name: 'site', private: true, dependencies: { payload: '^3' } }));
  mkdirSync(path.join(root, '.live-app-map'), { recursive: true });
  writeFileSync(projectFile(root, 'config'), config);
  return root;
}

describe('checkProjectConfig', () => {
  const root = makeProject('check', 'export const config = {};');

  test('верный конфиг проходит, роли и бэкенд сохраняются', () => {
    const r = checkProjectConfig({ name: 'p', apps: [{ id: 'web', label: 'Веб', dir: 'apps/web', baseUrl: 'http://localhost:1', roles: ['admin'] }], backend: ['apps'] }, root);
    expect(r).toEqual({ ok: true, config: { name: 'p', apps: [{ id: 'web', label: 'Веб', dir: 'apps/web', baseUrl: 'http://localhost:1', roles: ['admin'] }], backend: ['apps'] } });
  });

  test('пустые поля, неверный id, нет каталога, повтор id — каждое со своей подсказкой', () => {
    const r = checkProjectConfig(
      {
        name: ' ',
        apps: [
          { id: 'Web App', label: '', dir: 'apps/нет', baseUrl: 'не адрес', roles: [''] },
          { id: 'site', label: 'Сайт', dir: 'apps/site', baseUrl: 'http://localhost:2' },
          { id: 'site', label: 'Сайт 2', dir: 'apps/site', baseUrl: 'http://localhost:3' },
        ],
        backend: ['apps/api'],
      },
      root,
    );
    if (r.ok) {
      throw new Error('ожидались ошибки');
    }
    expect(r.errors.map((e) => e.split(':')[0])).toEqual(['name', 'apps[0].id', 'apps[0].label', 'apps[0].dir', 'apps[0].baseUrl', 'apps[0].roles', 'apps', 'backend']);
    expect(r.errors[0]).toContain("name: 'korbor'");
    expect(r.errors[6]).toContain('site повторяется');
  });

  test('links: концы <приложение>:<путь> известных приложений, label — непустая строка', () => {
    const app = { id: 'web', label: 'Веб', dir: 'apps/web', baseUrl: 'http://localhost:1' };
    const ok = checkProjectConfig({ name: 'p', apps: [app], links: [{ from: 'web:/a', to: 'web:/b', label: 'Таб' }, { from: 'web:/b', to: 'web:/' }] }, root);
    expect(ok.ok ? ok.config.links : null).toEqual([{ from: 'web:/a', to: 'web:/b', label: 'Таб' }, { from: 'web:/b', to: 'web:/' }]);
    const bad = checkProjectConfig({ name: 'p', apps: [app], links: [{ from: 'web/a', to: 'mini:/b', label: '' }, 3] }, root);
    expect(bad.ok ? [] : bad.errors).toEqual([
      "links[0].from: впишите '<id приложения>:<путь маршрута>', например 'miniapp:/feed'",
      'links[0].to: приложения mini нет в apps',
      'links[0].label: непустая строка или без поля',
      'links[1]: ожидается объект { from, to, label? }',
    ]);
  });

  test('viewport приложения: ширина и высота окна экранов; неверные числа — подсказка', () => {
    const app = { id: 'web', label: 'Веб', dir: 'apps/web', baseUrl: 'http://localhost:1' };
    const ok = checkProjectConfig({ name: 'p', apps: [{ ...app, viewport: { width: 1440, height: 900 } }] }, root);
    expect(ok.ok ? ok.config.apps[0]?.viewport : null).toEqual({ width: 1440, height: 900 });
    const bad = checkProjectConfig({ name: 'p', apps: [{ ...app, viewport: { width: 0, height: 'x' } }] }, root);
    expect(bad.ok ? [] : bad.errors).toEqual(['apps[0].viewport: размер окна экранов в пикселях, например viewport: { width: 1440, height: 900 } (ширина 200–2560, высота от 120)']);
  });

  test('query приложения: параметры адреса каждого экрана; не строки — подсказка', () => {
    const app = { id: 'web', label: 'Веб', dir: 'apps/web', baseUrl: 'http://localhost:1' };
    const ok = checkProjectConfig({ name: 'p', apps: [{ ...app, query: { surface: 'web' } }] }, root);
    expect(ok.ok ? ok.config.apps[0]?.query : null).toEqual({ surface: 'web' });
    const bad = checkProjectConfig({ name: 'p', apps: [{ ...app, query: { surface: 1 } }] }, root);
    expect(bad.ok ? [] : bad.errors).toEqual(["apps[0].query: параметры адреса экранов строками, например query: { surface: 'web' }"]);
  });

  test('нет config, нет приложений, приложение не объект', () => {
    expect(checkProjectConfig(undefined, root)).toEqual({ ok: false, errors: ['нет export const config: LamProjectConfig — добавьте его в config.ts'] });
    const empty = checkProjectConfig({ name: 'p', apps: [] }, root);
    expect(empty.ok ? [] : empty.errors).toEqual(['apps: добавьте хотя бы одно приложение { id, label, dir, baseUrl }']);
    const bad = checkProjectConfig({ name: 'p', apps: [7], backend: 'apps' }, root);
    expect(bad.ok ? [] : bad.errors).toEqual(['apps[0]: ожидается объект { id, label, dir, baseUrl }', "backend: список каталогов от корня проекта, например backend: ['apps/api']"]);
  });
});

describe('loadProjectConfig', () => {
  test('читает config.ts импортом Bun (import type стирается)', async () => {
    const root = makeProject(
      'load',
      "import type { LamProjectConfig } from '@live-app-map/sdk';\nexport const config: LamProjectConfig = { name: 'load', apps: [{ id: 'web', label: 'Веб', dir: 'apps/web', baseUrl: 'http://localhost:1' }] };\n",
    );
    expect((await loadProjectConfig(root)).apps.map((a) => a.id)).toEqual(['web']);
  });

  test('нет файла и неверный конфиг — ошибка с путём файла и списком полей', async () => {
    const none = path.join(tmp, 'нет-проекта');
    await expect(loadProjectConfig(none)).rejects.toThrow(`нет ${projectFile(none, 'config')}`);
    const root = makeProject('bad', "export const config = { name: '', apps: [] };\n");
    await expect(loadProjectConfig(root)).rejects.toThrow(/config\.ts:\n {2}- name: впишите имя проекта/);
  });
});

describe('роли и параметры маршрутов', () => {
  test('exampleParamsFor: [id] и :id — demo, [...rest] — [demo], [[...slug]] — пусто', () => {
    expect(exampleParamsFor(['/users/[id]', '/deals/:dealId/chat', '/docs/[...rest]', '/[[...slug]]', '/'])).toEqual({ id: 'demo', dealId: 'demo', rest: ['demo'], slug: [] });
  });

  test('withRoleStates: у каждого экрана состояние на каждую роль, заданное не повторяется, не-экраны не трогаются', () => {
    const doc = withRoleStates(
      appMap([page('feed', '/feed'), page('own', '/own', { states: [{ name: 'employer', note: 'своё' }] }), { id: 'l', kind: 'layout', title: 'l', pathPattern: '/' }]),
      'miniapp',
      ['recruiter', 'employer'],
    );
    expect(doc.nodes.map((n) => (n.states ?? []).map((s) => s.name))).toEqual([['recruiter', 'employer'], ['employer', 'recruiter'], []]);
    expect(doc.nodes[0]?.states?.[0]?.inject).toEqual({ role: 'recruiter', query: { lam_role: 'recruiter' }, labels: ['role', 'miniapp'] });
    const same = appMap([page('a', '/a')]);
    expect(withRoleStates(same, 'x', [])).toBe(same);
  });
});

describe('Payload', () => {
  const scanned = appMap([
    page('route:/[[...slug]]', '/[[...slug]]', { pathExample: '/', source: { file: 'app/[[...slug]]/page.tsx' } }),
    page('route:/admin/[[...segments]]', '/admin/[[...segments]]', { pathExample: '/admin' }),
    { id: 'not-found:/[[...slug]]', kind: 'not-found', title: 'nf', pathPattern: '/[[...slug]]', pathExample: '/' },
  ]);

  test('cmsPagesOf: slug обязателен; заголовок — строка или первый перевод; иначе slug', () => {
    expect(cmsPagesOf({ docs: [{ slug: 'home', title: 'Главная' }, { slug: 'faq', title: { en: '', ru: 'Вопросы' } }, { slug: 'x' }, { title: 'без slug' }, 7, { slug: 1 }] })).toEqual([
      { slug: 'home', title: 'Главная' },
      { slug: 'faq', title: 'Вопросы' },
      { slug: 'x', title: 'x' },
    ]);
    expect(cmsPagesOf({ items: [] })).toEqual([]);
    expect(cmsPagesOf(null)).toEqual([]);
  });

  test('withPayloadPages: вход и коллекции админки, страницы CMS с файлом catch-all, заголовок главной; not-found убран', () => {
    const doc = withPayloadPages(scanned, 'http://s', [
      { slug: 'home', title: 'Главная' },
      { slug: 'about', title: 'О нас' },
      { slug: 'not-found', title: '404' },
    ]);
    expect(doc.nodes.map((n) => `${n.id} ${n.title} ${n.url ?? ''}`)).toEqual([
      'route:/[[...slug]] Главная ',
      'route:/admin/[[...segments]] Payload: админка ',
      'payload:/admin/login Payload: вход http://s/admin/login',
      'payload:/admin/collections Payload: коллекции http://s/admin/collections',
      'cms:/about О нас http://s/about',
    ]);
    expect(doc.nodes[0]?.defaultPinned).toBe(true);
    expect(doc.nodes.find((n) => n.id === 'cms:/about')?.source?.file).toBe('app/[[...slug]]/page.tsx');
    expect(doc.edges.map((e) => `${e.from}->${e.to} ${e.label}`)).toEqual([
      'route:/admin/[[...segments]]->payload:/admin/login Payload: вход',
      'route:/admin/[[...segments]]->payload:/admin/collections Payload: коллекции',
      'route:/[[...slug]]->route:/admin/[[...segments]] CMS',
      'route:/[[...slug]]->cms:/about О нас',
    ]);
  });

  test('CMS не ответила — экраны админки есть, страниц CMS нет', () => {
    const doc = withPayloadPages(scanned, 'http://s', null);
    expect(doc.nodes.filter((n) => n.id.startsWith('cms:'))).toEqual([]);
    expect(doc.nodes[0]?.title).toBe('route:/[[...slug]]');
  });

  test('usesPayload: зависимость payload в package.json приложения', () => {
    const root = makeProject('payload', 'export const config = {};');
    expect([usesPayload(path.join(root, 'apps/site')), usesPayload(path.join(root, 'apps/web')), usesPayload(path.join(root, 'нет'))]).toEqual([true, false, false]);
  });

  test('fetchCmsPages на живом сервере: 200 — страницы (locale=all), ошибка и недоступный адрес — null', async () => {
    const seen: string[] = [];
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        seen.push(url.search);
        return url.pathname === '/ok/api/pages' ? Response.json({ docs: [{ slug: 'home', title: { ru: 'Главная' } }] }) : new Response('нет', { status: 500 });
      },
    });
    try {
      const base = `http://localhost:${server.port}`;
      expect(await fetchCmsPages(`${base}/ok`)).toEqual([{ slug: 'home', title: 'Главная' }]);
      expect(seen[0]).toContain('locale=all');
      expect(await fetchCmsPages(`${base}/bad`)).toBeNull();
    } finally {
      server.stop(true);
    }
    expect(await fetchCmsPages('http://127.0.0.1:1')).toBeNull();
  });
});

describe('mergeSurfaces и projectDocument', () => {
  const live = (pages: LiveAppMapDocument['pages'], edges: LiveAppMapDocument['edges'], baseUrl: string): LiveAppMapDocument => ({ version: '1.0', baseUrl, app: { name: 'x' }, pages, edges });
  const merged = mergeSurfaces([
    {
      id: 'site',
      title: 'Сайт',
      baseUrl: 'http://localhost:16001',
      doc: live(
        [
          { id: 'home', title: 'Главная', path: '/', url: 'http://other:9/' },
          { id: 'empty', title: 'e', url: '' },
          { id: 'q', title: 'q', url: 'http://localhost:16001/a?x=1' },
          { id: 'u', title: 'u', url: 'http://other/c' },
          { id: 'service:api', title: 'api', metadata: { kind: 'service' } },
        ],
        [{ id: 'e1', from: 'home', to: 'service:api' }, { from: 'home', to: 'нет' }],
        'http://localhost:16001',
      ),
    },
    {
      id: 'mini',
      title: 'Мини',
      baseUrl: 'https://vite.localhost:5175',
      doc: live([{ id: 'route:/', title: 'Корень', path: '/', url: 'http://localhost:3000/' }, { id: 'service:api', title: 'api', metadata: { kind: 'service' } }], [], 'https://vite.localhost:5175'),
    },
  ]);

  test('экраны с приставкой и адресом своего приложения (протокол из baseUrl), сервис — одна нода', () => {
    expect(merged.pages.map((p) => `${p.id} ${p.group ?? '-'} ${p.url ?? '-'}`)).toEqual([
      'site:home site http://localhost:16001/',
      'site:empty site ',
      'site:q site http://localhost:16001/a?x=1',
      'site:u site http://localhost:16001/c',
      'service:api - -',
      'mini:route:/ mini https://vite.localhost:5175/',
    ]);
    expect(merged.pages[0]?.metadata).toMatchObject({ surface: 'site', originalId: 'home', baseUrl: 'http://localhost:16001' });
    expect(merged.groups).toEqual([
      { id: 'site', title: 'Сайт', order: 0 },
      { id: 'mini', title: 'Мини', order: 1 },
    ]);
    expect(merged.edges.map((e) => `${e.id ?? '-'} ${e.from}->${e.to}`)).toEqual(['e1:site site:home->service:api']);
  });

  test('projectDocument: имя и адрес из конфига, code, docs и время сборки', () => {
    const code: CodeModel = { root: '/k', services: [], symbols: [], routes: [], tables: [] };
    const docs = { root: '/k', epochs: [], notes: [], guides: [] };
    const config = { name: 'k', apps: [{ id: 'site', label: 'Сайт', dir: 'apps/site', baseUrl: 'http://localhost:16001' }] };
    const doc = projectDocument(config, merged, code, docs, '2026-11-25T00:00:00.000Z');
    expect([doc.app?.name, doc.baseUrl, doc.app?.generatedAt]).toEqual(['k', 'http://localhost:16001', '2026-11-25T00:00:00.000Z']);
    expect(doc.code).toBe(code);
    expect(doc.extensions?.['project']).toEqual({ name: 'k', apps: { site: 'http://localhost:16001' }, liveOnly: true });
    expect(() => projectDocument({ name: 'k', apps: [] }, merged, code, docs, '')).toThrow('в конфиге проекта нет приложений');
  });
});

describe('раздел code', () => {
  const sym = (name: string, file: string, extra: Partial<CodeSymbol> = {}): CodeSymbol => ({ id: name, kind: 'function', name, serviceId: 's', location: { file, line: 1 }, ...extra });

  test('keptSymbols: с описанием, с комментариями или из файла экрана', () => {
    const symbols = [sym('doc', 'a.ts', { doc: 'd' }), sym('note', 'b.ts', { comments: ['c'] }), sym('screen', 'screen.tsx'), sym('bare', 'c.ts')];
    expect(keptSymbols(symbols, [{ file: 'screen.tsx', calls: [] }]).map((s) => s.name)).toEqual(['doc', 'note', 'screen']);
  });

  test('surfaceCode: экраны своей приставки без неё, символы их файлов', () => {
    const code: CodeModel = {
      root: '/k',
      services: [],
      symbols: [sym('own', 'own.tsx'), sym('other', 'other.tsx')],
      routes: [],
      tables: [],
      screens: [
        { nodeId: 'miniapp:route:/feed', file: 'own.tsx', calls: [] },
        { nodeId: 'admin:route:/', file: 'other.tsx', calls: [] },
        { file: 'loose.tsx', calls: [] },
      ],
    };
    const own = surfaceCode(code, 'miniapp');
    expect(own.screens).toEqual([{ nodeId: 'route:/feed', file: 'own.tsx', calls: [] }]);
    expect(own.symbols.map((s) => s.name)).toEqual(['own']);
  });

  test('attachProjectCode на фикстуре: экраны приложения без приставки, в общем code — с приставкой', async () => {
    const fixture = path.join(ROOT, 'fixtures/source-monorepo');
    const scanned = await runScan({ dir: path.join(fixture, 'apps/web'), framework: 'next', baseUrl: 'http://localhost:3000' });
    const result = attachProjectCode(fixture, [{ id: 'web', doc: scanned.document }]);
    const own = result.maps.get('web')?.code?.screens ?? [];
    expect(own.length).toBeGreaterThan(0);
    expect((result.allCode.screens ?? []).map((s) => s.nodeId)).toEqual(own.map((s) => `web:${s.nodeId}`));
    expect(result.maps.get('web')?.edges.some((e) => e.kind === 'api')).toBe(true);
  });
});

describe('scanProject и scan --project', () => {
  const cms = Bun.serve({ port: 0, fetch: () => Response.json({ docs: [{ slug: 'pricing', title: { ru: 'Цены' } }] }) });
  afterAll(() => cms.stop(true));
  const config = (siteUrl: string, extraLink = ''): string =>
    `export const config = { name: 'demo', apps: [
  { id: 'web', label: 'Веб', dir: 'apps/web', baseUrl: 'https://web.localhost:5175', roles: ['user', 'admin'] },
  { id: 'site', label: 'Сайт', dir: 'apps/site', baseUrl: '${siteUrl}' },
], links: [
  { from: 'site:/', to: 'web:/', label: 'В приложение' },
  { from: 'site:/users/[id]', to: 'site:/about' },
${extraLink}] };\n`;

  test('одна карта в .live-app-map/map.json: группы приложений, роли, страница CMS, адреса своих приложений', async () => {
    const root = makeProject('scan', config(`http://localhost:${cms.port}`));
    const r = await scanProject({ project: root, now: () => new Date('2026-11-25T00:00:00.000Z') });
    expect(r.out).toBe(projectFile(root, 'map'));
    expect(r.warnings).toEqual([]);
    const parsed = parseLiveAppMapJson(readFileSync(r.out, 'utf8'));
    if (!parsed.ok) {
      throw new Error('map.json не разобрана');
    }
    const doc = parsed.document;
    expect(doc.app?.name).toBe('demo');
    expect(doc.groups?.map((g) => g.id)).toEqual(['web', 'site']);
    const web = doc.pages.filter((p) => p.group === 'web');
    expect(web.length).toBeGreaterThan(0);
    expect(web.every((p) => p.id.startsWith('web:') && (p.url ?? '').startsWith('https://web.localhost:5175/'))).toBe(true);
    expect(web.every((p) => (p.states ?? []).map((s) => s.name).join() === 'user,admin')).toBe(true);
    expect(doc.pages.find((p) => p.id === 'site:cms:/pricing')?.title).toBe('Цены');
    expect(doc.pages.some((p) => p.id === 'site:route:/users/[id]' && p.url === `http://localhost:${cms.port}/users/demo`)).toBe(true);
    const links = doc.edges.filter((e) => e.id?.startsWith('config-link:') === true).map((e) => `${e.from}->${e.to} ${e.label ?? ''}`);
    expect(links).toEqual(['site:route:/->web:route:/ В приложение', 'site:route:/users/[id]->site:route:/about ']);
  }, 120_000);

  test('CMS не отвечает — карта пишется, предупреждение; CLI печатает сводку в свой файл -o', async () => {
    const root = makeProject('cli', config('http://127.0.0.1:1', "  { from: 'web:/нет', to: 'web:/' },\n"));
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli(['scan', '--project', 'cli', '-o', 'out/map.json'], { log: (t) => out.push(t), error: (t) => err.push(t), cwd: tmp, now: () => new Date() });
    expect(code).toBe(0);
    const summary: unknown = JSON.parse(out.join('\n'));
    expect(summary).toMatchObject({ ok: true, project: 'demo', byApp: { web: expect.any(Number), site: expect.any(Number) }, out: path.join(tmp, 'out/map.json') });
    expect(err.some((l) => l.includes('site: CMS не отвечает'))).toBe(true);
    expect(err.some((l) => l.includes('links: нет экрана web:/нет'))).toBe(true);
    expect(readFileSync(path.join(tmp, 'out/map.json'), 'utf8')).toContain('"name": "demo"');
    expect(root).toBe(path.join(tmp, 'cli'));
  }, 120_000);
});


describe('viewport приложения в карте', () => {
  test('экраны приложения получают размер окна из конфига, свой размер экрана главнее, сервис — без размера', () => {
    const doc: LiveAppMapDocument = {
      version: '1.0',
      baseUrl: 'http://localhost:1',
      app: { name: 'x' },
      pages: [
        { id: 'a', title: 'a', path: '/a', url: 'http://localhost:1/a' },
        { id: 'b', title: 'b', path: '/b', url: 'http://localhost:1/b', viewport: { width: 390, height: 844 } },
        { id: 'service:api', title: 'api', metadata: { kind: 'service' } },
      ],
      edges: [],
    };
    const merged = mergeSurfaces([{ id: 'web', title: 'Веб', baseUrl: 'http://localhost:1', viewport: { width: 1440, height: 900 }, doc }]);
    expect(merged.pages.map((p) => `${p.id} ${p.viewport === undefined ? '-' : `${p.viewport.width}x${p.viewport.height ?? '?'}`}`)).toEqual(['web:a 1440x900', 'web:b 390x844', 'service:api -']);
  });

  test('query приложения в адресе каждого экрана, hash маршрута сохраняется, сервис — без адреса', () => {
    const doc: LiveAppMapDocument = {
      version: '1.0',
      baseUrl: 'http://localhost:1',
      app: { name: 'x' },
      pages: [
        { id: 'a', title: 'a', path: '/a', url: 'http://localhost:1/#/a' },
        { id: 'b', title: 'b', path: '/b', url: 'http://localhost:1/b?x=1' },
        { id: 'service:api', title: 'api', metadata: { kind: 'service' } },
      ],
      edges: [],
    };
    const merged = mergeSurfaces([{ id: 'web', title: 'Веб', baseUrl: 'http://localhost:1', query: { surface: 'web' }, doc }]);
    expect(merged.pages.map((p) => p.url ?? '-')).toEqual(['http://localhost:1/?surface=web#/a', 'http://localhost:1/b?x=1&surface=web', '-']);
  });
});
