#!/usr/bin/env bun
/**
 * Сканирует Korbor admin / miniapp / site и пишет maps/*.json + liveappmap.
 * Обогащает miniapp стейтами recruiter / employer.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { appMapToLiveAppMap } from '../packages/schema/src/index';
import { runScan } from '../packages/cli/src/index';
import type { AppMapDocument, AppMapNode, AppMapPageState } from '../packages/schema/src/types';

const KORBOR = path.resolve(import.meta.dir, '../../korbor');
const OUT = path.resolve(import.meta.dir, '../maps');
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
  const nodes: AppMapNode[] = doc.nodes.map((n) => {
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
  return {
    ...doc,
    nodes,
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

function writeBoth(name: string, doc: AppMapDocument): void {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(PUBLIC_MAPS, { recursive: true });
  const enterprisePath = path.join(OUT, `${name}.json`);
  const livePath = path.join(OUT, `${name}.liveappmap.json`);
  const pubLive = path.join(PUBLIC_MAPS, `${name}.liveappmap.json`);
  writeFileSync(enterprisePath, `${JSON.stringify(doc, null, 2)}\n`);
  const live = appMapToLiveAppMap(doc);
  writeFileSync(livePath, `${JSON.stringify(live, null, 2)}\n`);
  writeFileSync(pubLive, `${JSON.stringify(live, null, 2)}\n`);
  console.log(
    `wrote ${name}: pages=${doc.nodes.filter((n) => n.kind === 'page').length} edges=${doc.edges.length}`,
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
        slug: ['home'],
        segments: ['collections'],
        rest: ['PLATFORM_COMMISSION_BPS'],
      },
    });
    for (const d of result.diagnostics) {
      console.log(`[${d.severity}] ${d.code}: ${d.message}`);
    }
    writeBoth(t.name, t.enrich(result.document));
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
