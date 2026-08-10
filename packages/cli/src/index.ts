/**
 * Программный API CLI: scan / diff / doctor.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { formatDiagnostic, sortDiagnostics } from '@live-app-map/diagnostics';
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

/**
 * Авто-выбор scanner и запись графа.
 */
export async function runScan(opts: ScanCliOptions): Promise<ScanResult> {
  const abs = path.resolve(opts.dir);
  const framework =
    opts.framework && opts.framework !== 'auto'
      ? opts.framework
      : detectFramework(abs);

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
  } else {
    // try both
    const rr = await scanReactRouterApp(request);
    const nx = await scanNextApp(request);
    const rrPages = rr.document.nodes.filter((n) => n.kind === 'page').length;
    const nxPages = nx.document.nodes.filter((n) => n.kind === 'page').length;
    result = rrPages >= nxPages ? rr : nx;
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
 * Diff двух JSON файлов.
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
