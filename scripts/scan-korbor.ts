#!/usr/bin/env bun
/**
 * Сканирует Korbor admin / miniapp / site и пишет maps/*.json + liveappmap.
 * Обогащает miniapp стейтами recruiter / employer.
 *
 * ## Single-writer policy (maps consistency)
 *
 * - **Канон (source of truth):** `maps/` — enterprise AppMap (`*.json`) и
 *   LiveAppMap (`*.liveappmap.json`). Пишет только этот скрипт (`scan:korbor`).
 * - **Зеркало (static serve):** `apps/visualizer-spa/public/maps/*.liveappmap.json`
 *   — побайтовая копия соответствующего файла из `maps/` после записи канона.
 * - Не править `public/maps` вручную и не генерировать туда отдельно:
 *   только sync из канона через {@link writeMapsAndSyncPublic}.
 * - Проверка равенства пар: `scripts/verify-korbor-maps.test.ts`.
 */
import {
  copyFileSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import {
  appMapToLiveAppMap,
  parseLiveAppMapJson,
  type LiveAppMapDocument,
  type LiveAppMapPage,
  type LiveAppMapEdge,
} from '../packages/schema/src/index';
import { runScan } from '../packages/cli/src/index';
import type { AppMapDocument, AppMapNode, AppMapPageState } from '../packages/schema/src/types';

const KORBOR = path.resolve(import.meta.dir, '../../korbor');
/** Канонический каталог артефактов scan (single-writer source of truth). */
const OUT = path.resolve(import.meta.dir, '../maps');
/**
 * Зеркало liveappmap для Vite static serve visualizer.
 * Содержимое только через copy из `OUT` — не независимый writer.
 */
const PUBLIC_MAPS = path.resolve(import.meta.dir, '../apps/visualizer-spa/public/maps');

const ROLE_STATES: AppMapPageState[] = [
  {
    name: 'recruiter',
    note: 'Роль рекрутера — лента, отклики, верификация',
    inject: {
      role: 'recruiter',
      query: { lam_role: 'recruiter' },
      labels: ['role', 'miniapp'],
    },
  },
  {
    name: 'employer',
    note: 'Роль клиента (employer) — создание вакансий, кабинет',
    inject: {
      role: 'employer',
      query: { lam_role: 'employer' },
      labels: ['role', 'miniapp', 'client'],
    },
  },
];

const EMPLOYER_PATHS = new Set([
  '/employer/create',
  '/employer/vacancies',
  '/employer/vacancies/[id]',
]);

const RECRUITER_PATHS = new Set([
  '/feed',
  '/applications',
  '/applications/[id]/submit',
  '/verification',
  '/wallet',
  '/vacancies/[id]',
]);

function enrichMiniapp(doc: AppMapDocument): AppMapDocument {
  let nodes: AppMapNode[] = doc.nodes.map((n) => {
    if (n.kind !== 'page') {
      return n;
    }
    const states: AppMapPageState[] = [...(n.states ?? [])];
    if (EMPLOYER_PATHS.has(n.pathPattern) || n.pathPattern.startsWith('/employer/')) {
      const emp = ROLE_STATES.find((s) => s.name === 'employer');
      if (emp && !states.some((s) => s.name === 'employer')) {
        states.push(emp);
      }
    }
    if (RECRUITER_PATHS.has(n.pathPattern) || n.pathPattern === '/chats' || n.pathPattern.startsWith('/chat')) {
      const rec = ROLE_STATES.find((s) => s.name === 'recruiter');
      if (rec && !states.some((s) => s.name === 'recruiter')) {
        states.push(rec);
      }
    }
    // tabs shared — both roles
    if (
      n.pathPattern === '/feed' ||
      n.pathPattern === '/wallet' ||
      n.pathPattern === '/chats' ||
      n.pathPattern === '/register' ||
      n.pathPattern === '/'
    ) {
      for (const st of ROLE_STATES) {
        if (!states.some((s) => s.name === st.name)) {
          states.push(st);
        }
      }
    }
    return states.length ? { ...n, states } : n;
  });

  // Навигационные рёбра между основными табами (RR config element:null — AST edges бедны)
  const byPath = new Map(
    nodes
      .filter((n) => n.kind === 'page')
      .map((n) => [n.pathExample ?? n.pathPattern, n.id] as const),
  );
  const tabOrder = [
    '/feed',
    '/applications',
    '/wallet',
    '/chats',
    '/verification',
    '/employer/create',
    '/employer/vacancies',
    '/register',
  ];
  const extraEdges = [...doc.edges];
  const seen = new Set(extraEdges.map((e) => `${e.from}->${e.to}`));
  for (let i = 0; i < tabOrder.length - 1; i++) {
    const from = byPath.get(tabOrder[i] ?? '');
    const to = byPath.get(tabOrder[i + 1] ?? '');
    if (!from || !to) {
      continue;
    }
    const key = `${from}->${to}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    extraEdges.push({
      id: `edge:tab:${from}->${to}`,
      from,
      to,
      kind: 'link',
      confidence: 'medium',
      label: 'tab',
    });
  }
  const feedId = byPath.get('/feed');
  const vacId = [...byPath.entries()].find(
    ([p]) => p.startsWith('/vacancies/') && !p.includes('employer'),
  )?.[1];
  if (feedId && vacId && !seen.has(`${feedId}->${vacId}`)) {
    extraEdges.push({
      id: `edge:${feedId}->${vacId}`,
      from: feedId,
      to: vacId,
      kind: 'link',
      confidence: 'high',
      label: 'Open vacancy',
    });
  }

  return {
    ...doc,
    nodes,
    edges: extraEdges,
    extensions: {
      ...doc.extensions,
      stateInject: {
        roles: ['recruiter', 'employer'],
        queryParam: 'lam_role',
        description:
          'Korbor miniapp: recruiter vs employer (клиент). Visualizer добавляет ?lam_role= в iframe URL.',
      },
    },
  };
}

/**
 * Single-writer: пишет канон в `maps/`, затем синхронизирует liveappmap в public/maps.
 *
 * @param name — базовое имя артефакта (например `korbor-miniapp`)
 * @param doc — enterprise AppMap после enrich
 */
function writeMapsAndSyncPublic(name: string, doc: AppMapDocument): void {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(PUBLIC_MAPS, { recursive: true });
  const enterprisePath = path.join(OUT, `${name}.json`);
  const livePath = path.join(OUT, `${name}.liveappmap.json`);
  const pubLive = path.join(PUBLIC_MAPS, `${name}.liveappmap.json`);
  writeFileSync(enterprisePath, `${JSON.stringify(doc, null, 2)}\n`);
  const live = appMapToLiveAppMap(doc);
  writeFileSync(livePath, `${JSON.stringify(live, null, 2)}\n`);
  // Зеркало: только copy канона — не второй независимый JSON.stringify
  copyFileSync(livePath, pubLive);
  console.log(
    `wrote ${name} (canon maps/ + sync public/maps): pages=${doc.nodes.filter((n) => n.kind === 'page').length} edges=${doc.edges.length}`,
  );
}

async function main(): Promise<void> {
  if (!existsSync(KORBOR)) {
    throw new Error(`Korbor not found at ${KORBOR}`);
  }

  const targets = [
    {
      name: 'korbor-miniapp',
      dir: path.join(KORBOR, 'apps/miniapp'),
      // Vite miniapp binds https://vite.localhost:5175 (see korbor vite config)
      baseUrl: process.env.KORBOR_MINIAPP_URL ?? 'https://vite.localhost:5175',
      framework: 'react-router' as const,
      enrich: enrichMiniapp,
    },
    {
      name: 'korbor-admin',
      dir: path.join(KORBOR, 'apps/admin'),
      baseUrl: 'http://localhost:16002',
      framework: 'react-router' as const,
      enrich: (d: AppMapDocument) => d,
    },
    {
      name: 'korbor-site',
      dir: path.join(KORBOR, 'apps/site'),
      baseUrl: 'http://localhost:16001',
      framework: 'next' as const,
      enrich: (d: AppMapDocument) => d,
    },
  ];

  for (const t of targets) {
    console.log(`\n=== scan ${t.name} ===`);
    const result = await runScan({
      dir: t.dir,
      baseUrl: t.baseUrl,
      framework: t.framework,
      exampleParams: {
        id: 'demo',
        vacancyId: 'vac-demo',
        dealId: 'deal-demo',
        userId: 'user-demo',
        candidateId: 'cand-demo',
        disputeId: 'disp-demo',
        ledgerId: 'led-demo',
        documentId: 'doc-demo',
        threadId: 'thr-demo',
        entryId: 'ent-demo',
        category: 'system',
        step: 'profile',
        code: 'terms',
        slug: [] as string[],
        segments: ['collections'],
        rest: ['PLATFORM_COMMISSION_BPS'],
      },
    });
    for (const d of result.diagnostics) {
      console.log(`[${d.severity}] ${d.code}: ${d.message}`);
    }
    let doc = t.enrich(result.document);
    if (t.name === 'korbor-site') {
      doc = enrichSite(doc, t.baseUrl);
    }
    writeMapsAndSyncPublic(t.name, doc);
  }

  // Unified live graph: prefix ids per surface; no god-root ownership.
  writeKorborAllLiveMap();
  // Stale non-live dogfood zip
  const staleAppmap = path.join(OUT, 'korbor-miniapp.appmap');
  if (existsSync(staleAppmap)) {
    unlinkSync(staleAppmap);
    console.log('removed stale maps/korbor-miniapp.appmap');
  }
}

/**
 * Собирает korbor-all.liveappmap.json из трёх surface-карт.
 * Корни продуктов остаются отдельными (miniapp:/, admin:/, site:/).
 * Cross-link edges только с label, без замены entry roots.
 */
function writeKorborAllLiveMap(): void {
  const surfaces: Array<{
    id: string;
    title: string;
    file: string;
    expectedHost: string;
  }> = [
    {
      id: 'miniapp',
      title: 'Мини-приложение',
      file: path.join(OUT, 'korbor-miniapp.liveappmap.json'),
      expectedHost: 'vite.localhost:5175',
    },
    {
      id: 'admin',
      title: 'Админка',
      file: path.join(OUT, 'korbor-admin.liveappmap.json'),
      expectedHost: 'localhost:16002',
    },
    {
      id: 'site',
      title: 'Сайт',
      file: path.join(OUT, 'korbor-site.liveappmap.json'),
      expectedHost: 'localhost:16001',
    },
  ];

  const pages: LiveAppMapPage[] = [];
  const edges: LiveAppMapEdge[] = [];
  const groups: Array<{ id: string; title: string; order: number }> = [];

  for (const s of surfaces) {
    if (!existsSync(s.file)) {
      throw new Error(`merge all: missing ${s.file}`);
    }
    const raw = JSON.parse(readFileSync(s.file, 'utf8')) as unknown;
    const parsed = parseLiveAppMapJson(JSON.stringify(raw));
    if (!parsed.ok) {
      throw new Error(`merge all: invalid ${s.file}`);
    }
    const doc = parsed.document;
    groups.push({ id: s.id, title: s.title, order: groups.length });
    const idMap = new Map<string, string>();

    for (const p of doc.pages) {
      // hygiene: absolute url must stay on this surface host
      let url = p.url;
      if (url) {
        try {
          const u = new URL(url);
          if (u.host !== s.expectedHost) {
            const pathPart = p.path ?? u.pathname;
            const protocol = s.expectedHost.includes('5175') ? 'https' : 'http';
            url = `${protocol}://${s.expectedHost}${pathPart.startsWith('/') ? pathPart : `/${pathPart}`}`;
          }
        } catch {
          url = p.url;
        }
      }
      const nid = `${s.id}:${p.id}`;
      idMap.set(p.id, nid);
      pages.push({
        ...p,
        id: nid,
        group: s.id,
        title: `[${s.title}] ${p.title}`,
        url,
        metadata: {
          ...p.metadata,
          surface: s.id,
          originalId: p.id,
          baseUrl: doc.baseUrl,
        },
      });
    }

    for (const e of doc.edges) {
      const from = idMap.get(e.from);
      const to = idMap.get(e.to);
      if (!from || !to) {
        continue;
      }
      edges.push({
        ...e,
        id: e.id ? `${e.id}:${s.id}` : undefined,
        from,
        to,
      });
    }
  }

  // Intentional cross-surface links (label only — not ownership of roots)
  const siteHome = pages.find((p) => p.id === 'site:site-home');
  const adminRoot = pages.find((p) => p.id === 'admin:route:/');
  const miniRoot = pages.find((p) => p.id === 'miniapp:route:/');
  if (siteHome && adminRoot) {
    edges.push({
      from: siteHome.id,
      to: adminRoot.id,
      label: 'Админка',
      kind: 'link',
    });
  }
  if (siteHome && miniRoot) {
    edges.push({
      from: siteHome.id,
      to: miniRoot.id,
      label: 'Miniapp',
      kind: 'link',
    });
  }

  const live: LiveAppMapDocument = {
    version: '1.0',
    baseUrl: 'http://localhost:16001',
    app: {
      name: 'Korbor (все поверхности)',
      platform: 'web',
      generator: 'scan-korbor+merge/0.2.0',
      generatedAt: new Date().toISOString(),
      description: 'Unified live graph: miniapp + admin + site (no god-root)',
    },
    pages,
    edges,
    groups,
    layout: { algorithm: 'dagre', direction: 'LR' },
    extensions: {
      korbor: {
        surfaces: {
          miniapp: 'https://vite.localhost:5175',
          admin: 'http://localhost:16002',
          site: 'http://localhost:16001',
          api: 'http://localhost:16000',
          visualizer: 'http://localhost:4310',
        },
        liveOnly: true,
      },
    },
  };

  const livePath = path.join(OUT, 'korbor-all.liveappmap.json');
  const pubLive = path.join(PUBLIC_MAPS, 'korbor-all.liveappmap.json');
  writeFileSync(livePath, `${JSON.stringify(live, null, 2)}\n`);
  copyFileSync(livePath, pubLive);
  console.log(
    `wrote korbor-all (canon + public): pages=${pages.length} edges=${edges.length}`,
  );
}

/** Конкретные CMS-страницы поверх catch-all Next (Payload). */
function enrichSite(doc: AppMapDocument, baseUrl: string): AppMapDocument {
  const extras: AppMapNode[] = [
    {
      id: 'site-home',
      kind: 'page',
      title: 'Marketing Home',
      pathPattern: '/',
      pathExample: '/',
      url: `${baseUrl}/`,
      groupIds: ['marketing'],
      defaultPinned: true,
      iframePolicy: { enabled: true },
    },
    {
      id: 'site-payload-admin',
      kind: 'page',
      title: 'Payload Admin',
      pathPattern: '/admin',
      pathExample: '/admin',
      url: `${baseUrl}/admin`,
      groupIds: ['cms'],
      iframePolicy: { enabled: true },
    },
    {
      id: 'site-payload-login',
      kind: 'page',
      title: 'Payload Login',
      pathPattern: '/admin/login',
      pathExample: '/admin/login',
      url: `${baseUrl}/admin/login`,
      groupIds: ['cms'],
      iframePolicy: { enabled: true },
    },
    {
      id: 'site-payload-collections',
      kind: 'page',
      title: 'Payload Collections',
      pathPattern: '/admin/collections',
      pathExample: '/admin/collections',
      url: `${baseUrl}/admin/collections`,
      groupIds: ['cms'],
      iframePolicy: { enabled: true },
    },
  ];
  const nodes = [
    ...extras,
    ...doc.nodes.filter(
      (n) =>
        n.kind === 'page' &&
        !extras.some((e) => e.pathExample === (n.pathExample ?? n.pathPattern)),
    ),
  ];
  const edges = [
    {
      id: 'edge:site-home->site-payload-admin',
      from: 'site-home',
      to: 'site-payload-admin',
      kind: 'link' as const,
      confidence: 'high' as const,
      label: 'CMS',
    },
    {
      id: 'edge:site-payload-admin->site-payload-login',
      from: 'site-payload-admin',
      to: 'site-payload-login',
      kind: 'link' as const,
      confidence: 'medium' as const,
      label: 'Login',
    },
    {
      id: 'edge:site-payload-admin->site-payload-collections',
      from: 'site-payload-admin',
      to: 'site-payload-collections',
      kind: 'link' as const,
      confidence: 'medium' as const,
      label: 'Collections',
    },
    ...doc.edges,
  ];
  return {
    ...doc,
    nodes,
    edges,
    groups: [
      { id: 'marketing', title: 'Marketing', color: '#3b82f6', order: 0 },
      { id: 'cms', title: 'Payload CMS', color: '#a78bfa', order: 1 },
    ],
  };
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
