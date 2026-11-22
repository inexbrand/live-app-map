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
import { appMapToLiveAppMap, parseLiveAppMapJson, type CodeModel, type LiveAppMapDocument } from '../packages/schema/src/index';
import { runScan } from '../packages/cli/src/index';
import type { AppMapDocument } from '../packages/schema/src/types';
import type { DocsModel } from '../packages/schema/src/docs-model';
import { attachKorborCode, type KorborSurfaceDoc } from './korbor-code';
import { fetchCmsPages, withCmsPages } from './korbor-site-pages';
import { enrichMiniapp, enrichSite, korborAllDocument, mergeSurfaces } from './korbor-enrich';

/** Куда смотреть и куда писать. */
export type KorborScanOptions = {
  /** Репозиторий Korbor. */
  readonly korbor: string;
  /** Канонический каталог артефактов scan (single-writer source of truth). */
  readonly out: string;
  /** Зеркало liveappmap для Vite static serve visualizer: только copy из `out`. */
  readonly publicMaps: string;
  /** Адрес мини-приложения (Vite miniapp — https://vite.localhost:5175, см. vite config korbor). */
  readonly miniappUrl: string;
  /** Адрес сайта (CMS читается отсюда). */
  readonly siteUrl: string;
};

/**
 * Опции из окружения: `KORBOR_DIR` (иначе соседний ../korbor), `LAM_MAPS_OUT`,
 * `LAM_PUBLIC_MAPS_OUT`, `KORBOR_MINIAPP_URL`.
 *
 * @param env - переменные окружения
 * @param scriptDir - каталог скрипта
 * @returns опции скана
 */
export function optionsFromEnv(env: Readonly<Record<string, string | undefined>>, scriptDir: string): KorborScanOptions {
  return {
    korbor: path.resolve(env['KORBOR_DIR'] ?? path.join(scriptDir, '../../korbor')),
    out: path.resolve(env['LAM_MAPS_OUT'] ?? path.join(scriptDir, '../maps')),
    publicMaps: path.resolve(env['LAM_PUBLIC_MAPS_OUT'] ?? path.join(scriptDir, '../apps/visualizer-spa/public/maps')),
    miniappUrl: env['KORBOR_MINIAPP_URL'] ?? 'https://vite.localhost:5175',
    siteUrl: 'http://localhost:16001',
  };
}

/**
 * Single-writer: пишет канон в `maps/`, затем синхронизирует liveappmap в public/maps.
 *
 * @param opts — каталоги канона и зеркала
 * @param name — базовое имя артефакта (например `korbor-miniapp`)
 * @param doc — enterprise AppMap после enrich
 */
function writeMapsAndSyncPublic(opts: KorborScanOptions, name: string, doc: AppMapDocument): void {
  mkdirSync(opts.out, { recursive: true });
  mkdirSync(opts.publicMaps, { recursive: true });
  const enterprisePath = path.join(opts.out, `${name}.json`);
  const livePath = path.join(opts.out, `${name}.liveappmap.json`);
  const pubLive = path.join(opts.publicMaps, `${name}.liveappmap.json`);
  writeFileSync(enterprisePath, `${JSON.stringify(doc, null, 2)}\n`);
  const live = appMapToLiveAppMap(doc);
  writeFileSync(livePath, `${JSON.stringify(live, null, 2)}\n`);
  // Зеркало: только copy канона — не второй независимый JSON.stringify
  copyFileSync(livePath, pubLive);
  console.log(
    `wrote ${name} (canon maps/ + sync public/maps): pages=${doc.nodes.filter((n) => n.kind === 'page').length} edges=${doc.edges.length}`,
  );
}

/** Поверхность Korbor для скана. */
type ScanTarget = {
  readonly name: string;
  readonly dir: string;
  readonly baseUrl: string;
  readonly framework: 'react-router' | 'next';
};

/** Примеры параметров маршрутов Korbor для URL экранов. */
const EXAMPLE_PARAMS = {
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
  slug: [],
  segments: ['collections'],
  rest: ['PLATFORM_COMMISSION_BPS'],
};

/** Скан поверхности и её обогащение (мини-приложение — роли, сайт — страницы и CMS). */
async function scanTarget(t: ScanTarget): Promise<AppMapDocument> {
  console.log(`\n=== scan ${t.name} ===`);
  const result = await runScan({ dir: t.dir, baseUrl: t.baseUrl, framework: t.framework, exampleParams: EXAMPLE_PARAMS });
  for (const d of result.diagnostics) {
    console.log(`[${d.severity}] ${d.code}: ${d.message}`);
  }
  if (t.name === 'korbor-miniapp') {
    return enrichMiniapp(result.document);
  }
  return t.name === 'korbor-site' ? siteWithCms(enrichSite(result.document, t.baseUrl), t.baseUrl) : result.document;
}

/** Страницы живой CMS сайта; CMS не отвечает — карта без них и предупреждение. */
async function siteWithCms(doc: AppMapDocument, baseUrl: string): Promise<AppMapDocument> {
  const cms = await fetchCmsPages(baseUrl);
  if (cms === null) {
    console.log(`[warning] CMS сайта не отвечает (${baseUrl}/api/pages): страницы CMS не добавлены — запустите site`);
    return doc;
  }
  return withCmsPages(doc, baseUrl, cms);
}

/** Поверхности для скана. */
function scanTargets(opts: KorborScanOptions): ScanTarget[] {
  return [
    { name: 'korbor-miniapp', dir: path.join(opts.korbor, 'apps/miniapp'), baseUrl: opts.miniappUrl, framework: 'react-router' },
    { name: 'korbor-admin', dir: path.join(opts.korbor, 'apps/admin'), baseUrl: 'http://localhost:16002', framework: 'react-router' },
    { name: 'korbor-site', dir: path.join(opts.korbor, 'apps/site'), baseUrl: opts.siteUrl, framework: 'next' },
  ];
}

/**
 * Сканирует три поверхности, пишет их карты и общую карту в канон и зеркало.
 *
 * @param opts - репозиторий, каталоги, адреса
 */
export async function runKorborScan(opts: KorborScanOptions): Promise<void> {
  if (!existsSync(opts.korbor)) {
    throw new Error(`Korbor не найден: ${opts.korbor}. Укажите KORBOR_DIR=<путь к репозиторию korbor>`);
  }
  const surfaceDocs: KorborSurfaceDoc[] = [];
  for (const t of scanTargets(opts)) {
    surfaceDocs.push({ id: t.name.replace('korbor-', ''), doc: await scanTarget(t) });
  }
  // Один скан исходников на все поверхности: сервисы, роуты, БД, экран → роут.
  const withCode = attachKorborCode(opts.korbor, surfaceDocs);
  for (const s of surfaceDocs) {
    writeMapsAndSyncPublic(opts, `korbor-${s.id}`, mapWithCode(withCode.maps, s.id));
  }
  // Unified live graph: prefix ids per surface; no god-root ownership.
  writeKorborAllLiveMap(opts, withCode.allCode, withCode.docs);
  removeStaleAppmap(opts.out);
}

/** Карта поверхности с кодом; нет — ошибка (скан кода потерял поверхность). */
function mapWithCode(maps: ReadonlyMap<string, AppMapDocument>, id: string): AppMapDocument {
  const doc = maps.get(id);
  if (doc === undefined) {
    throw new Error(`нет карты с кодом для ${id}`);
  }
  return doc;
}

/** Старый не-live архив dogfood. */
function removeStaleAppmap(out: string): void {
  const staleAppmap = path.join(out, 'korbor-miniapp.appmap');
  if (existsSync(staleAppmap)) {
    unlinkSync(staleAppmap);
    console.log('removed stale maps/korbor-miniapp.appmap');
  }
}

/** Поверхности общей карты: подпись группы, свой хост. */
const ALL_SURFACES = [
  { id: 'miniapp', title: 'Мини-приложение', expectedHost: 'vite.localhost:5175' },
  { id: 'admin', title: 'Админка', expectedHost: 'localhost:16002' },
  { id: 'site', title: 'Сайт', expectedHost: 'localhost:16001' },
];

/** Карта поверхности из канона `maps/`. */
function readSurface(out: string, id: string): LiveAppMapDocument {
  const file = path.join(out, `korbor-${id}.liveappmap.json`);
  if (!existsSync(file)) {
    throw new Error(`merge all: missing ${file}`);
  }
  const parsed = parseLiveAppMapJson(readFileSync(file, 'utf8'));
  if (!parsed.ok) {
    throw new Error(`merge all: invalid ${file}`);
  }
  return parsed.document;
}

/**
 * Собирает korbor-all.liveappmap.json из трёх surface-карт.
 * Корни продуктов остаются отдельными (miniapp:/, admin:/, site:/).
 * Cross-link edges только с label, без замены entry roots.
 */
function writeKorborAllLiveMap(opts: KorborScanOptions, code: CodeModel, docs: DocsModel): void {
  const merged = mergeSurfaces(ALL_SURFACES.map((s) => ({ ...s, doc: readSurface(opts.out, s.id) })));
  const live = korborAllDocument(merged, code, docs, new Date().toISOString());
  const livePath = path.join(opts.out, 'korbor-all.liveappmap.json');
  writeFileSync(livePath, `${JSON.stringify(live, null, 2)}\n`);
  copyFileSync(livePath, path.join(opts.publicMaps, 'korbor-all.liveappmap.json'));
  console.log(`wrote korbor-all (canon + public): pages=${merged.pages.length} edges=${merged.edges.length}`);
}

if (import.meta.main) {
  runKorborScan(optionsFromEnv(process.env, import.meta.dir)).catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
