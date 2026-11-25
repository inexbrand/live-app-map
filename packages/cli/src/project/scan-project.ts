/**
 * Скан проекта по `<проект>/.live-app-map/config.ts`: все приложения и бэкенд —
 * в одну карту `<проект>/.live-app-map/map.json`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { appMapToLiveAppMap, type AppMapDocument, type Diagnostic, type LiveAppMapDocument } from '@live-app-map/schema';
import type { LamApp, LamProjectConfig } from '@live-app-map/sdk';
import { runScan } from '../index';
import { exampleParamsFor, withRoleStates } from './app-enrich';
import { attachProjectCode, type SurfaceDoc } from './code';
import { loadProjectConfig, projectFile } from './config';
import { applyLinks, mergeSurfaces, projectDocument } from './merge';
import { fetchCmsPages, usesPayload, withPayloadPages, type CmsPage } from './payload';

/** Опции скана проекта. */
export type ProjectScanOptions = {
  /** Корень проекта (там .live-app-map). */
  readonly project: string;
  /** Файл карты; по умолчанию `<проект>/.live-app-map/map.json`. */
  readonly out?: string;
  /** Страницы CMS приложения Payload; по умолчанию — запрос к живому сайту. */
  readonly cmsPages?: (baseUrl: string) => Promise<CmsPage[] | null>;
  /** Время сборки карты. */
  readonly now?: () => Date;
};

/** Итог скана проекта. */
export type ProjectScanResult = {
  readonly config: LamProjectConfig;
  readonly document: LiveAppMapDocument;
  readonly out: string;
  readonly diagnostics: readonly Diagnostic[];
  /** Предупреждения, которые не останавливают скан (CMS не ответила и т. п.). */
  readonly warnings: readonly string[];
};

/** Шаблоны путей экранов карты. */
function patternsOf(doc: AppMapDocument): string[] {
  return doc.nodes.map((n) => n.pathPattern);
}

/** Скан одного приложения: экраны с примерами параметров, роли, страницы Payload. */
async function scanApp(root: string, app: LamApp, opts: ProjectScanOptions, warnings: string[]): Promise<{ doc: AppMapDocument; diagnostics: readonly Diagnostic[] }> {
  const dir = path.join(root, app.dir);
  const first = await runScan({ dir, baseUrl: app.baseUrl, framework: 'auto' });
  const params = exampleParamsFor(patternsOf(first.document));
  const scanned = Object.keys(params).length === 0 ? first : await runScan({ dir, baseUrl: app.baseUrl, framework: 'auto', exampleParams: params });
  let doc = withRoleStates(scanned.document, app.id, app.roles ?? []);
  if (usesPayload(dir)) {
    const cms = await (opts.cmsPages ?? fetchCmsPages)(app.baseUrl);
    if (cms === null) {
      warnings.push(`${app.id}: CMS не отвечает (${app.baseUrl}/api/pages) — страницы CMS не добавлены, запустите приложение`);
    }
    doc = withPayloadPages(doc, app.baseUrl, cms);
  }
  return { doc, diagnostics: scanned.diagnostics };
}

/**
 * Сканирует проект и пишет общую карту.
 *
 * @param opts - корень проекта, файл вывода, источник страниц CMS
 * @returns конфиг, карта, путь файла, диагностика и предупреждения
 */
export async function scanProject(opts: ProjectScanOptions): Promise<ProjectScanResult> {
  const root = path.resolve(opts.project);
  const config = await loadProjectConfig(root);
  const warnings: string[] = [];
  const diagnostics: Diagnostic[] = [];
  const surfaces: SurfaceDoc[] = [];
  for (const app of config.apps) {
    const r = await scanApp(root, app, opts, warnings);
    diagnostics.push(...r.diagnostics);
    surfaces.push({ id: app.id, doc: r.doc });
  }
  const code = attachProjectCode(root, surfaces);
  diagnostics.push(...code.diagnostics);
  const merged = mergeSurfaces(
    config.apps.map((app) => {
      const doc = code.maps.get(app.id);
      if (doc === undefined) {
        throw new Error(`скан кода потерял приложение ${app.id}`);
      }
      return { id: app.id, title: app.label, baseUrl: app.baseUrl, ...(app.viewport === undefined ? {} : { viewport: app.viewport }), ...(app.query === undefined ? {} : { query: app.query }), doc: appMapToLiveAppMap(doc) };
    }),
  );
  warnings.push(...applyLinks(merged, config.links ?? []));
  const document = projectDocument(config, merged, code.allCode, code.docs, (opts.now ?? (() => new Date()))().toISOString());
  const out = path.resolve(opts.out ?? projectFile(root, 'map'));
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
  return { config, document, out, diagnostics, warnings };
}
