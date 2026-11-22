/**
 * Скрипты карт Korbor и smoke на реальных функциях: роли мини-приложения, страницы
 * сайта и CMS (живой HTTP-сервер), слияние поверхностей, раздел code на фикстуре,
 * разбор вывода CLI и HTTP-проверки.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import path from 'node:path';
import type { LiveAppMapDocument } from '../packages/schema/src/index';
import { FORMAT_VERSION, type AppMapDocument, type AppMapNode } from '../packages/schema/src/types';
import { runScan } from '../packages/cli/src/index';
import { enrichMiniapp, enrichSite, korborAllDocument, mergeSurfaces } from './korbor-enrich';
import { cmsPagesOf, fetchCmsPages, withCmsPages } from './korbor-site-pages';
import { attachKorborCode, keptSymbols, surfaceCode } from './korbor-code';
import type { CodeModel, CodeSymbol } from '../packages/schema/src/index';
import { execFileSync } from 'node:child_process';
import { isPlainObject, parseScanStdout, probeHttp, probeLine, smokeScanFixture, spaKindOf, summaryOf, tallyOf } from './runtime-smoke';
import { optionsFromEnv, runKorborScan } from './scan-korbor';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { parseLiveAppMapJson } from '../packages/schema/src/index';

const ROOT = path.resolve(import.meta.dir, '..');

function page(id: string, p: string, extra: Partial<AppMapNode> = {}): AppMapNode {
  return { id, kind: 'page', title: id, pathPattern: p, ...extra };
}

function appMap(nodes: AppMapNode[]): AppMapDocument {
  return {
    formatVersion: FORMAT_VERSION,
    kind: 'live-app-map',
    generatedAt: '2026-11-22T00:00:00.000Z',
    generator: { name: 'test', version: '0' },
    revision: 'r',
    project: { name: 'x', root: '/x', framework: 'react-router' },
    baseUrl: null,
    nodes,
    edges: [],
  };
}

describe('enrichMiniapp', () => {
  const doc = enrichMiniapp(
    appMap([
      page('feed', '/feed'),
      page('apps', '/applications'),
      page('wallet', '/wallet'),
      page('create', '/employer/create'),
      page('chat', '/chat/[id]'),
      page('vac', '/vacancies/[id]', { pathExample: '/vacancies/demo' }),
      page('own', '/employer/profile', { states: [{ name: 'employer', note: 'своя' }] }),
      page('other', '/about'),
    ]),
  );
  const states = (id: string): string[] => (doc.nodes.find((n) => n.id === id)?.states ?? []).map((s) => `${s.name}${s.note === 'своя' ? '*' : ''}`);

  test('роли по пути: общий таб — обе, клиент, рекрутер; заданный стейт не дублируется', () => {
    expect(states('feed')).toEqual(['recruiter', 'employer']);
    expect(states('apps')).toEqual(['recruiter']);
    expect(states('create')).toEqual(['employer']);
    expect(states('chat')).toEqual(['recruiter']);
    expect(states('own')).toEqual(['employer*']);
    expect(doc.nodes.find((n) => n.id === 'other')?.states).toBeUndefined();
  });

  test('рёбра соседних табов, «лента → вакансия», расширение stateInject', () => {
    expect(doc.edges.map((e) => `${e.from}->${e.to} ${e.label}`)).toEqual([
      'feed->apps tab',
      'apps->wallet tab',
      'feed->vac Open vacancy',
    ]);
    expect(doc.extensions?.['stateInject']).toMatchObject({ queryParam: 'lam_role', roles: ['recruiter', 'employer'] });
  });

  test('повторное обогащение не добавляет рёбер и стейтов', () => {
    const again = enrichMiniapp(doc);
    expect(again.edges).toEqual(doc.edges);
    expect(again.nodes).toEqual(doc.nodes);
  });
});

describe('страницы сайта', () => {
  const scanned = appMap([
    page('home', '/'),
    page('cms', '/[[...slug]]', { source: { file: 'src/app/[[...slug]]/page.tsx' } }),
    { id: 'svc', kind: 'service', title: 'api', pathPattern: '' },
  ]);

  test('enrichSite: главная и Payload вместо скановых, только экраны, группы', () => {
    const doc = enrichSite(scanned, 'http://s');
    expect(doc.nodes.map((n) => `${n.id} ${n.url ?? ''}`)).toEqual([
      'site-home http://s/',
      'site-payload-admin http://s/admin',
      'site-payload-login http://s/admin/login',
      'site-payload-collections http://s/admin/collections',
      'cms ',
    ]);
    expect(doc.nodes[0]?.defaultPinned).toBe(true);
    expect(doc.edges.map((e) => e.label)).toEqual(['CMS', 'Login', 'Collections']);
    expect(doc.groups?.map((g) => g.id)).toEqual(['marketing', 'cms']);
  });

  test('cmsPagesOf: slug обязателен, без title — slug; не тот ответ — пусто', () => {
    expect(cmsPagesOf({ docs: [{ slug: 'home', title: 'Главная' }, { slug: 'faq' }, { title: 'без slug' }, 7] })).toEqual([
      { slug: 'home', title: 'Главная' },
      { slug: 'faq', title: 'faq' },
    ]);
    expect(cmsPagesOf({ items: [] })).toEqual([]);
    expect(cmsPagesOf(null)).toEqual([]);
  });

  test('withCmsPages: новые пути — экраны с файлом catch-all и ребром от главной', () => {
    const doc = withCmsPages(scanned, 'http://s', [
      { slug: 'home', title: 'Главная' },
      { slug: 'about', title: 'О нас' },
      { slug: 'not-found', title: '404' },
    ]);
    const added = doc.nodes.filter((n) => n.id.startsWith('site-cms:'));
    expect(added.map((n) => `${n.id} ${n.pathPattern} ${n.url} ${n.source?.file}`)).toEqual([
      'site-cms:about /about http://s/about src/app/[[...slug]]/page.tsx',
    ]);
    expect(doc.edges.map((e) => `${e.from}->${e.to}`)).toEqual(['home->site-cms:about']);
  });
});

describe('fetchCmsPages на живом сервере', () => {
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/ok/api/pages') {
        return Response.json({ docs: [{ slug: 'home', title: 'Главная' }] });
      }
      return new Response('нет', { status: 500 });
    },
  });
  afterAll(() => server.stop(true));
  const base = `http://localhost:${server.port}`;

  test('ответ 200 — страницы; ошибка сервера и недоступный адрес — null', async () => {
    expect(await fetchCmsPages(`${base}/ok`)).toEqual([{ slug: 'home', title: 'Главная' }]);
    expect(await fetchCmsPages(`${base}/bad`)).toBeNull();
    expect(await fetchCmsPages('http://127.0.0.1:1')).toBeNull();
  });
});

describe('mergeSurfaces', () => {
  const live = (pages: LiveAppMapDocument['pages'], edges: LiveAppMapDocument['edges'], baseUrl: string): LiveAppMapDocument => ({
    version: '1.0',
    baseUrl,
    app: { name: 'x' },
    pages,
    edges,
  });
  const merged = mergeSurfaces([
    {
      id: 'site',
      title: 'Сайт',
      expectedHost: 'localhost:16001',
      doc: live(
        [
          { id: 'site-home', title: 'Главная', path: '/', url: 'http://other:9/' },
          { id: 'service:api', title: 'api', metadata: { kind: 'service' } },
        ],
        [{ id: 'e1', from: 'site-home', to: 'service:api' }, { from: 'site-home', to: 'нет' }],
        'http://localhost:16001',
      ),
    },
    {
      id: 'admin',
      title: 'Админка',
      expectedHost: 'localhost:16002',
      doc: live(
        [
          { id: 'route:/', title: 'Корень', url: 'http://localhost:16002/' },
          { id: 'service:api', title: 'api', metadata: { kind: 'service' } },
        ],
        [],
        'http://localhost:16002',
      ),
    },
  ]);

  test('экраны с приставкой и хостом поверхности, сервис — одна нода, рёбра только известных нод', () => {
    expect(merged.pages.map((p) => `${p.id} ${p.group ?? '-'} ${p.url ?? '-'}`)).toEqual([
      'site:site-home site http://localhost:16001/',
      'service:api - -',
      'admin:route:/ admin http://localhost:16002/',
    ]);
    expect(merged.pages[0]?.metadata).toMatchObject({ surface: 'site', originalId: 'site-home', baseUrl: 'http://localhost:16001' });
    expect(merged.groups).toEqual([
      { id: 'site', title: 'Сайт', order: 0 },
      { id: 'admin', title: 'Админка', order: 1 },
    ]);
  });

  test('рёбра поверхности и связь сайта с корнем админки', () => {
    expect(merged.edges.map((e) => `${e.id ?? '-'} ${e.from}->${e.to} ${e.label ?? ''}`)).toEqual([
      'e1:site site:site-home->service:api ',
      '- site:site-home->admin:route:/ Админка',
    ]);
  });

  test('korborAllDocument: общий документ с code, docs и временем сборки', () => {
    const code = { root: '/k', services: [], symbols: [], routes: [], tables: [] };
    const docs = { root: '/k', epochs: [], notes: [], guides: [] };
    const doc = korborAllDocument(merged, code, docs, '2026-11-22T00:00:00.000Z');
    expect(doc.app?.generatedAt).toBe('2026-11-22T00:00:00.000Z');
    expect(doc.pages).toBe(merged.pages);
    expect(doc.code).toBe(code);
  });
});

describe('attachKorborCode на фикстуре', () => {
  test('экраны поверхности без приставки, в общем code — с приставкой; символы отобраны', async () => {
    const fixture = path.join(ROOT, 'fixtures/source-monorepo');
    const scanned = await runScan({ dir: path.join(fixture, 'apps/web'), framework: 'next', baseUrl: 'http://localhost:3000' });
    const result = attachKorborCode(fixture, [{ id: 'web', doc: scanned.document }]);
    const own = result.maps.get('web')?.code?.screens ?? [];
    const all = result.allCode.screens ?? [];
    expect(own.length).toBeGreaterThan(0);
    expect(all.map((s) => s.nodeId)).toEqual(own.map((s) => `web:${s.nodeId}`));
    const screenFiles = new Set(all.map((s) => s.file));
    expect(result.allCode.symbols.every((s) => s.doc !== undefined || s.comments !== undefined || screenFiles.has(s.location.file))).toBe(true);
    expect((result.maps.get('web')?.code?.symbols ?? []).every((s) => screenFiles.has(s.location.file))).toBe(true);
  });
});

describe('runKorborScan на копии фикстур', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'lam-korbor-'));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const cms = Bun.serve({ port: 0, fetch: () => Response.json({ docs: [{ slug: 'pricing', title: 'Цены' }] }) });
  afterAll(() => cms.stop(true));

  test('три поверхности: канон, зеркало, общая карта с группами и страницей CMS', async () => {
    const korbor = path.join(tmp, 'korbor');
    mkdirSync(path.join(korbor, 'apps'), { recursive: true });
    writeFileSync(path.join(korbor, 'package.json'), JSON.stringify({ name: 'korbor', private: true, workspaces: ['apps/*'] }));
    cpSync(path.join(ROOT, 'fixtures/react-router-basic'), path.join(korbor, 'apps/miniapp'), { recursive: true });
    cpSync(path.join(ROOT, 'fixtures/react-router-basic'), path.join(korbor, 'apps/admin'), { recursive: true });
    cpSync(path.join(ROOT, 'fixtures/next-app-router-basic'), path.join(korbor, 'apps/site'), { recursive: true });
    const out = path.join(tmp, 'maps');
    const publicMaps = path.join(tmp, 'public');
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, 'korbor-miniapp.appmap'), 'старый архив');
    await runKorborScan({ korbor, out, publicMaps, miniappUrl: 'https://vite.localhost:5175', siteUrl: `http://localhost:${cms.port}` });

    for (const name of ['korbor-miniapp', 'korbor-admin', 'korbor-site', 'korbor-all']) {
      expect(readFileSync(path.join(publicMaps, `${name}.liveappmap.json`), 'utf8')).toBe(readFileSync(path.join(out, `${name}.liveappmap.json`), 'utf8'));
    }
    expect(existsSync(path.join(out, 'korbor-miniapp.appmap'))).toBe(false);
    const all = parseLiveAppMapJson(readFileSync(path.join(out, 'korbor-all.liveappmap.json'), 'utf8'));
    if (!all.ok) {
      throw new Error('korbor-all не разобрана');
    }
    expect(all.document.groups?.map((g) => g.id)).toEqual(['miniapp', 'admin', 'site']);
    expect(all.document.pages.some((p) => p.id === 'site:site-cms:pricing')).toBe(true);
    expect(all.document.pages.filter((p) => p.group === 'miniapp').every((p) => p.id.startsWith('miniapp:'))).toBe(true);
    const site: AppMapDocument = JSON.parse(readFileSync(path.join(out, 'korbor-site.json'), 'utf8'));
    expect(site.nodes[0]?.id).toBe('site-home');
  }, 120_000);

  test('нет репозитория — понятная ошибка', async () => {
    const dir = path.join(tmp, 'нет');
    await expect(runKorborScan({ korbor: dir, out: dir, publicMaps: dir, miniappUrl: '', siteUrl: '' })).rejects.toThrow(`Korbor не найден: ${dir}`);
  });

  test('optionsFromEnv: переменные окружения или каталоги рядом со скриптом', () => {
    expect(optionsFromEnv({}, '/r/scripts')).toEqual({
      korbor: '/korbor',
      out: '/r/maps',
      publicMaps: '/r/apps/visualizer-spa/public/maps',
      miniappUrl: 'https://vite.localhost:5175',
      siteUrl: 'http://localhost:16001',
    });
    const o = optionsFromEnv({ KORBOR_DIR: '/k', LAM_MAPS_OUT: '/o', LAM_PUBLIC_MAPS_OUT: '/p', KORBOR_MINIAPP_URL: 'https://m' }, '/r/scripts');
    expect([o.korbor, o.out, o.publicMaps, o.miniappUrl]).toEqual(['/k', '/o', '/p', 'https://m']);
  });
});

describe('runtime smoke', () => {
  test('probeLine и summaryOf: строки лога и итог', () => {
    expect(probeLine({ kind: 'ok', status: 200 }, 'u')).toEqual(['OK', 200, 'u']);
    expect(probeLine({ kind: 'skip' }, 'u')).toEqual(['SKIP', 'u', 'down']);
    expect(probeLine({ kind: 'bad', status: 503 }, 'u')).toEqual(['WARN', 'u', 503]);
    expect(probeLine({ kind: 'bad', message: 'HTTP 500' }, 'u')).toEqual(['WARN', 'u', 'HTTP 500']);
    const spa = tallyOf(['bad']);
    const live = tallyOf(['bad', 'ok']);
    expect(summaryOf({ ok: true, pages: 4 }, spa, live)).toEqual({ scanOk: true, pages: 4, spa: 'bad', failedCritical: 0, warnings: 2, ok: true });
    expect(summaryOf({ ok: false, pages: 0 }, spa, live).ok).toBe(false);
  });

  test('parseScanStdout: первый «{» до последнего «}», ok по флагу или по страницам', () => {
    expect(parseScanStdout('лог\n{"pages":3,"timing":{"ms":1}}\n')).toEqual({ pages: 3, ok: true });
    expect(parseScanStdout('{"pages":0}')).toEqual({ pages: 0, ok: false });
    expect(parseScanStdout('{"pages":2,"ok":false}')).toEqual({ pages: 2, ok: false });
    expect(parseScanStdout('{"pages":"3"}')).toBeNull();
    expect(parseScanStdout('[1]')).toBeNull();
    expect(parseScanStdout('{сломано}')).toBeNull();
    expect(parseScanStdout('   ')).toBeNull();
  });

  test('сводка проверок и состояние SPA', () => {
    expect(tallyOf(['skip', 'bad', 'bad'])).toEqual({ anyOk: false, anyBad: true, warnings: 2 });
    expect(spaKindOf(tallyOf(['bad', 'ok']))).toBe('ok');
    expect(spaKindOf(tallyOf(['bad', 'skip']))).toBe('bad');
    expect(spaKindOf(tallyOf(['skip']))).toBe('skip');
  });

  test('probeHttp: 2xx–4xx — ok, 5xx — bad, нет сервера — skip', async () => {
    const server = Bun.serve({ port: 0, fetch: (req) => new Response('', { status: new URL(req.url).pathname === '/down' ? 503 : 404 }) });
    try {
      expect(await probeHttp(`http://localhost:${server.port}/`, 2000)).toEqual({ kind: 'ok', status: 404 });
      expect(await probeHttp(`http://localhost:${server.port}/down`, 2000)).toEqual({ kind: 'bad', status: 503, message: 'HTTP 503' });
    } finally {
      server.stop(true);
    }
    expect((await probeHttp('http://127.0.0.1:1/', 2000)).kind).toBe('skip');
  });

  test('smokeScanFixture: CLI сканирует фикстуру Next', async () => {
    const r = await smokeScanFixture();
    expect(r.ok).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(r.pages).toBeGreaterThan(0);
  }, 60_000);
});

describe('границы обогащения и слияния', () => {
  const sym = (name: string, file: string, extra: Partial<CodeSymbol> = {}): CodeSymbol => ({ id: name, kind: 'function', name, serviceId: 's', location: { file, line: 1 }, ...extra });

  test('keptSymbols: остаётся символ с описанием, с комментариями или из файла экрана', () => {
    const symbols = [sym('doc', 'a.ts', { doc: 'd' }), sym('note', 'b.ts', { comments: ['c'] }), sym('screen', 'screen.tsx'), sym('bare', 'c.ts')];
    expect(keptSymbols(symbols, [{ file: 'screen.tsx', calls: [] }]).map((s) => s.name)).toEqual(['doc', 'note', 'screen']);
  });

  test('surfaceCode: экраны своей приставки без неё, экран без nodeId не берётся, символы их файлов', () => {
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

  test('enrichMiniapp: клиент — пути /employer/, рекрутер — свой набор; без вакансии и без ленты — нет ребра «лента → вакансия»', () => {
    const roles = (p: string) => enrichMiniapp(appMap([page('x', p)])).nodes[0]?.states?.map((s) => s.name);
    expect(roles('/employer/x')).toEqual(['employer']);
    expect(roles('/verification')).toEqual(['recruiter']);
    expect(roles('/employer')).toBeUndefined();
    const label = 'Open vacancy';
    expect(enrichMiniapp(appMap([page('feed', '/feed')])).edges.some((e) => e.label === label)).toBe(false);
    expect(enrichMiniapp(appMap([page('vac', '/vacancies/[id]', { pathExample: '/vacancies/1' })])).edges.some((e) => e.label === label)).toBe(false);
  });

  test('enrichSite: только главная закреплена, у всех страниц включён iframe, группы по порядку', () => {
    const doc = enrichSite(appMap([page('home', '/')]), 'http://s');
    const site = doc.nodes.filter((n) => n.id.startsWith('site-'));
    expect(site.map((n) => [n.id, n.defaultPinned === true, n.iframePolicy?.enabled])).toEqual([
      ['site-home', true, true],
      ['site-payload-admin', false, true],
      ['site-payload-login', false, true],
      ['site-payload-collections', false, true],
    ]);
    expect(doc.groups?.map((g) => g.order)).toEqual([0, 1]);
  });

  test('mergeSurfaces: пустой url остаётся, свой хост — как есть, чужой — путь страницы или адреса', () => {
    const doc = (pages: LiveAppMapDocument['pages']): LiveAppMapDocument => ({ version: '1.0', baseUrl: 'http://localhost:16001', app: { name: 'x' }, pages, edges: [] });
    const merged = mergeSurfaces([
      {
        id: 'site',
        title: 'Сайт',
        expectedHost: 'localhost:16001',
        doc: doc([
          { id: 'empty', title: 'e', url: '' },
          { id: 'own', title: 'o', url: 'http://localhost:16001/a?x=1' },
          { id: 'path', title: 'p', path: 'b', url: 'http://other/zzz' },
          { id: 'url', title: 'u', url: 'http://other/c' },
        ]),
      },
    ]);
    expect(merged.pages.map((p) => p.url)).toEqual(['', 'http://localhost:16001/a?x=1', 'http://localhost:16001/b', 'http://localhost:16001/c']);
  });

  test('korborAllDocument: только живые экраны', () => {
    const doc = korborAllDocument({ pages: [], edges: [], groups: [] }, { root: '/k', services: [], symbols: [], routes: [], tables: [] }, { root: '/k', epochs: [], notes: [], guides: [] }, '2026-11-22T00:00:00.000Z');
    expect(doc.extensions?.['korbor']).toMatchObject({ liveOnly: true });
  });

  test('cmsPagesOf: slug и title должны быть строками; у страницы CMS включён iframe', () => {
    expect(cmsPagesOf({ docs: [{ slug: 1 }, { slug: 'a', title: 2 }, null] })).toEqual([{ slug: 'a', title: 'a' }]);
    const added = withCmsPages(appMap([page('home', '/')]), 'http://s', [{ slug: 'about', title: 'О нас' }]).nodes.find((n) => n.id === 'site-cms:about');
    expect(added?.iframePolicy).toEqual({ enabled: true });
  });

  test('isPlainObject и parseScanStdout: null, массив, «}» до «{», одна страница — ok, нечисловое pages', () => {
    expect([isPlainObject(null), isPlainObject([]), isPlainObject('x'), isPlainObject({})]).toEqual([false, false, false, true]);
    expect(parseScanStdout('} {')).toBeNull();
    expect(parseScanStdout('{')).toBeNull();
    expect(parseScanStdout('{"pages":1}')).toEqual({ pages: 1, ok: true });
    expect(parseScanStdout('{"pages":0,"ok":true}')).toEqual({ pages: 0, ok: true });
    expect(parseScanStdout('{"pages":1e999}')).toBeNull();
    expect(parseScanStdout('null {"x":1}')).toBeNull();
  });

  test('probeHttp: 200 и 499 — ok, 500 — bad; самоподписанный HTTPS принимается; текст ошибки — как у fetch', async () => {
    const server = Bun.serve({ port: 0, fetch: (req) => new Response('', { status: Number(new URL(req.url).pathname.slice(1)) }) });
    const dir = mkdtempSync(path.join(os.tmpdir(), 'lam-tls-'));
    const [key, cert] = [path.join(dir, 'key.pem'), path.join(dir, 'cert.pem')];
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
    const secure = Bun.serve({ port: 0, tls: { key: Bun.file(key), cert: Bun.file(cert) }, fetch: () => new Response('ok') });
    try {
      const at = (s: number) => probeHttp(`http://localhost:${server.port}/${s}`, 2000);
      expect([await at(200), await at(499), await at(500)]).toEqual([
        { kind: 'ok', status: 200 },
        { kind: 'ok', status: 499 },
        { kind: 'bad', status: 500, message: 'HTTP 500' },
      ]);
      expect(await probeHttp(`https://localhost:${secure.port}/`, 2000)).toEqual({ kind: 'ok', status: 200 });
    } finally {
      server.stop(true);
      secure.stop(true);
      rmSync(dir, { recursive: true, force: true });
    }
    const refused = await fetch('http://127.0.0.1:1/').then(
      () => '',
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    );
    expect(await probeHttp('http://127.0.0.1:1/', 2000)).toEqual({ kind: 'skip', message: refused.slice(0, 120) });
  });
});
