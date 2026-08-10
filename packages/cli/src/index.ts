/**
 * Программный API CLI: scan / diff / doctor.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { diag, formatDiagnostic, sortDiagnostics } from '@live-app-map/diagnostics';
import { diffDocuments, sortDocument } from '@live-app-map/graph';
import { detectFramework } from '@live-app-map/scanner-core';
import { scanNextApp } from '@live-app-map/scanner-next';
import { scanReactRouterApp } from '@live-app-map/scanner-react-router';
import {
  appMapToLiveAppMap,
  parseAppMapDocument,
  type AppMapDocument,
  type FrameworkKind,
} from '@live-app-map/schema';
import type { ScanRequest, ScanResult } from '@live-app-map/scanner-core';

export type ScanCliOptions = {
  readonly dir: string;
  readonly baseUrl?: string;
  readonly framework?: FrameworkKind | 'auto';
  readonly out?: string;
  readonly format?: 'enterprise' | 'liveappmap';
  readonly exampleParams?: ScanRequest['exampleParams'];
  readonly includeRouteHandlers?: boolean;
};

/** Кандидаты dual-scan при framework=unknown (порядок = tie-break priority). */
const UNKNOWN_DUAL_SCAN_ORDER = ['next', 'react-router'] as const;

type DualScanCandidate = (typeof UNKNOWN_DUAL_SCAN_ORDER)[number];

/**
 * Считает page-ноды в результате скана.
 *
 * @param result - результат scanner
 * @returns число kind=page
 */
function countPageNodes(result: ScanResult): number {
  return result.document.nodes.filter((n) => n.kind === 'page').length;
}

/**
 * Dual-scan при неизвестном framework: оба scanner'а, stable tie-break + diagnostics.
 * Tie-break: больше pages; при равенстве — фиксированный порядок
 * (`next` раньше `react-router`), без silent page-count-only выбора.
 *
 * @param request - запрос скана
 * @param absRoot - абсолютный корень проекта
 * @returns выбранный ScanResult с FRAMEWORK_AUTO_DETECT / NO_ROUTES_FOUND
 */
async function scanUnknownWithDualHeuristic(
  request: ScanRequest,
  absRoot: string,
): Promise<ScanResult> {
  const byKind: Record<DualScanCandidate, ScanResult> = {
    next: await scanNextApp(request),
    'react-router': await scanReactRouterApp(request),
  };
  const scores: Record<DualScanCandidate, number> = {
    next: countPageNodes(byKind.next),
    'react-router': countPageNodes(byKind['react-router']),
  };

  let winner: DualScanCandidate = UNKNOWN_DUAL_SCAN_ORDER[0];
  let bestScore = scores[winner];
  for (const kind of UNKNOWN_DUAL_SCAN_ORDER) {
    const score = scores[kind];
    if (score > bestScore) {
      bestScore = score;
      winner = kind;
    }
  }

  const chosen = byKind[winner];
  const scoreParts = UNKNOWN_DUAL_SCAN_ORDER.map(
    (k) => `${k}=${scores[k]}`,
  ).join(', ');
  const autoDiag = diag('FRAMEWORK_AUTO_DETECT', {
    message: `framework=unknown: dual-scan выбрал ${winner} (${scoreParts} pages; tie-break: ${UNKNOWN_DUAL_SCAN_ORDER.join(' > ')})`,
    file: absRoot,
  });

  const diagnostics = [...chosen.diagnostics, autoDiag];
  if (bestScore === 0) {
    diagnostics.push(
      diag('NO_ROUTES_FOUND', {
        message: 'dual-scan: оба scanner не нашли page-маршруты',
        file: absRoot,
      }),
    );
  }

  return {
    document: {
      ...chosen.document,
      project: {
        ...chosen.document.project,
        framework: winner,
      },
    },
    diagnostics,
    timing: chosen.timing,
  };
}

/**
 * Авто-выбор scanner и запись графа.
 *
 * @param opts - опции CLI-скана
 * @returns результат скана (document + diagnostics + timing)
 */
export async function runScan(opts: ScanCliOptions): Promise<ScanResult> {
  const abs = path.resolve(opts.dir);
  const explicit =
    opts.framework !== undefined && opts.framework !== 'auto'
      ? opts.framework
      : null;
  const framework = explicit ?? detectFramework(abs);

  const request: ScanRequest = {
    projectRoot: abs,
    framework,
    baseUrl: opts.baseUrl ?? null,
    exampleParams: opts.exampleParams,
    includeRouteHandlers: opts.includeRouteHandlers,
  };

  let result: ScanResult;
  if (framework === 'react-router') {
    result = await scanReactRouterApp(request);
  } else if (framework === 'next' || framework === 'hybrid') {
    result = await scanNextApp(request);
  } else if (framework === 'unknown') {
    result = await scanUnknownWithDualHeuristic(request, abs);
  } else {
    // manual / прочие: dual-scan с тем же stable path
    result = await scanUnknownWithDualHeuristic(request, abs);
  }

  if (opts.out) {
    const sorted = sortDocument(result.document);
    const payload =
      opts.format === 'liveappmap' ? appMapToLiveAppMap(sorted) : sorted;
    writeFileSync(opts.out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  return result;
}

/**
 * Diff двух JSON файлов (enterprise AppMapDocument).
 *
 * @param leftPath - путь к левому JSON
 * @param rightPath - путь к правому JSON
 * @returns AppMapDiff
 */
export function runDiff(
  leftPath: string,
  rightPath: string,
): ReturnType<typeof diffDocuments> {
  const left = JSON.parse(readFileSync(leftPath, 'utf8')) as unknown;
  const right = JSON.parse(readFileSync(rightPath, 'utf8')) as unknown;
  const l = parseAppMapDocument(left);
  const r = parseAppMapDocument(right);
  if (!l.ok || !r.ok) {
    throw new Error('diff: один из файлов не AppMapDocument formatVersion 1');
  }
  return diffDocuments(l.document, r.document);
}

export type DoctorReport = {
  readonly dir: string;
  readonly framework: FrameworkKind;
  readonly hasPackageJson: boolean;
  readonly hasNextConfig: boolean;
  readonly hasAppDir: boolean;
  readonly hasPagesDir: boolean;
  readonly notes: string[];
};

/**
 * Диагностика окружения проекта.
 *
 * @param dir - каталог проекта
 * @returns DoctorReport
 */
export function runDoctor(dir: string): DoctorReport {
  const abs = path.resolve(dir);
  const framework = detectFramework(abs);
  const notes: string[] = [];
  const hasPackageJson = existsSync(path.join(abs, 'package.json'));
  const hasNextConfig =
    existsSync(path.join(abs, 'next.config.ts')) ||
    existsSync(path.join(abs, 'next.config.js')) ||
    existsSync(path.join(abs, 'next.config.mjs'));
  const hasAppDir =
    existsSync(path.join(abs, 'app')) || existsSync(path.join(abs, 'src', 'app'));
  const hasPagesDir =
    existsSync(path.join(abs, 'pages')) ||
    existsSync(path.join(abs, 'src', 'pages'));

  if (!hasPackageJson) {
    notes.push('package.json не найден');
  }
  if (framework === 'unknown') {
    notes.push('framework не определён — укажите --framework');
  }
  if (framework === 'next' && !hasAppDir && !hasPagesDir) {
    notes.push('Next без app/ и pages/');
  }
  notes.push(`framework=${framework}`);

  return {
    dir: abs,
    framework,
    hasPackageJson,
    hasNextConfig,
    hasAppDir,
    hasPagesDir,
    notes,
  };
}

export { formatDiagnostic, sortDiagnostics };
export type { AppMapDocument };
export { defineConfig, type LiveAppMapConfig } from './define-config';
