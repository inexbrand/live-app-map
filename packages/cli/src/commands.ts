/**
 * Команды CLI: разбор флагов и вывод. Процесс не трогают — возвращают код выхода,
 * печатают через переданный вывод (bin.ts передаёт console и завершает процесс).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { formatDiagnostic, sortDiagnostics } from '@live-app-map/diagnostics';
import { exportAppMapZip } from '@live-app-map/export-appmap';
import { diffChangeCount } from '@live-app-map/graph';
import { parseAppMapDocument, type CodeModel, type Diagnostic } from '@live-app-map/schema';
import { runCodeScan, runDiff, runDoctor, runScan } from './index';
import { initSummary, runInit } from './init';
import { scanProject, type ProjectScanResult } from './project/scan-project';

/** Вывод команды: stdout, stderr, рабочий каталог и часы (для имени файла замечания). */
export type CliIo = {
  readonly log: (text: string) => void;
  readonly error: (text: string) => void;
  readonly cwd: string;
  readonly now: () => Date;
};

type Command = (argv: readonly string[], io: CliIo) => Promise<number>;

const USAGE = `live-app-map — scanner & tools

Usage:
  live-app-map scan --project <path> [-o map.json]
  live-app-map scan --dir <path> [-o out.json] [--base-url url] [--framework next|react-router|auto] [--code-dir <path>] [--format enterprise|liveappmap]
  live-app-map code --dir <path> [-o out.json] [--format enterprise|liveappmap]
  live-app-map diff <left.json> <right.json>
  live-app-map doctor [--dir <path>]
  live-app-map export <appmap.json> -o map.appmap
  live-app-map feedback --file feedback.json [--print-prompt]
  live-app-map init [--project <path>] [--tarball <url|path.tgz>]
  live-app-map dev --target-url <url> [--port 4310] [--map <file.json>]

Examples:
  live-app-map scan --project ../korbor
  live-app-map scan --dir ../korbor/apps/miniapp --base-url https://vite.localhost:5175 -o maps/miniapp.json
  live-app-map doctor --dir ../korbor/apps/site
  live-app-map code --dir ../korbor -o maps/korbor-code.json
  live-app-map scan --dir ../korbor/apps/miniapp --code-dir ../korbor -o maps/miniapp-with-code.json
  live-app-map export maps/miniapp.json -o maps/miniapp.appmap
  live-app-map feedback --file lam-feedback-route_feed.json --print-prompt
`;

/** Справка; код выхода 1. */
function usage(io: CliIo): number {
  io.log(USAGE);
  return 1;
}

/**
 * Значение флага: следующий аргумент после имени.
 *
 * @param argv - аргументы
 * @param name - имя флага
 * @returns значение или null (флага нет или он последний)
 */
export function flag(argv: readonly string[], name: string): string | null {
  const i = argv.indexOf(name);
  return i === -1 ? null : (argv[i + 1] ?? null);
}

/** Путь вывода: -o или --out. */
function outFlag(argv: readonly string[]): string | null {
  return flag(argv, '-o') ?? flag(argv, '--out');
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * Сводка раздела code для вывода CLI.
 *
 * @param code - раздел code
 * @returns числа сервисов, роутов, таблиц, символов
 */
export function codeSummary(code: CodeModel): Record<string, number> {
  const apiCalls = code.apiCalls ?? [];
  return {
    services: code.services.length,
    routes: code.routes.length,
    routesWithDoc: code.routes.filter((r) => r.doc !== undefined).length,
    routesWithDb: code.routes.filter((r) => r.dbCalls.length > 0).length,
    routesWithDbInLoop: code.routes.filter((r) => r.dbCalls.some((c) => c.inLoop === true)).length,
    tables: code.tables.length,
    symbols: code.symbols.length,
    apiCalls: apiCalls.length,
    apiCallsMatched: apiCalls.filter((c) => c.routeId !== undefined).length,
    screensWithApi: (code.screens ?? []).filter((s) => s.calls.length > 0).length,
  };
}

function summaryOf(code: CodeModel | undefined): Record<string, number> {
  return code === undefined ? {} : codeSummary(code);
}

/** Человекочитаемый stderr: severity/code/message (+ подсказка из каталога). */
function printDiagnostics(io: CliIo, diagnostics: readonly Diagnostic[], withHint: boolean): void {
  for (const d of diagnostics) {
    io.error(formatDiagnostic(d));
    if (withHint && d.hint !== undefined && d.hint.length > 0) {
      io.error(`  подсказка: ${d.hint}`);
    }
  }
}

/**
 * Сводка скана проекта для вывода: экраны по приложениям, рёбра, файл карты.
 *
 * @param r - итог скана проекта
 * @returns объект для JSON-вывода
 */
export function projectScanSummary(r: ProjectScanResult): Record<string, unknown> {
  const screens = r.document.pages.filter((p) => p.metadata?.['kind'] !== 'service');
  const byApp = Object.fromEntries(r.config.apps.map((a) => [a.id, screens.filter((p) => p.group === a.id).length]));
  return {
    ok: true,
    project: r.config.name,
    screens: screens.length,
    byApp,
    edges: r.document.edges.length,
    apiEdges: r.document.edges.filter((e) => e.kind === 'api').length,
    routes: r.document.code?.routes.length ?? 0,
    tables: r.document.code?.tables.length ?? 0,
    warnings: r.warnings,
    out: r.out,
  };
}

/** scan --project: карта всего проекта по его .live-app-map/config.ts. */
async function scanProjectCommand(project: string, argv: readonly string[], io: CliIo): Promise<number> {
  const out = outFlag(argv);
  const result = await scanProject({
    project: path.resolve(io.cwd, project),
    ...(out === null ? {} : { out: path.resolve(io.cwd, out) }),
    now: io.now,
  });
  printDiagnostics(io, sortDiagnostics(result.diagnostics).filter((d) => d.severity === 'error'), true);
  for (const w of result.warnings) {
    io.error(`[warning] ${w}`);
  }
  io.log(json(projectScanSummary(result)));
  return 0;
}

const scan: Command = async (argv, io) => {
  const project = flag(argv, '--project');
  if (project !== null) {
    return scanProjectCommand(project, argv, io);
  }
  const out = outFlag(argv) ?? undefined;
  const result = await runScan({
    dir: flag(argv, '--dir') ?? '.',
    out,
    baseUrl: flag(argv, '--base-url') ?? undefined,
    framework: (flag(argv, '--framework') ?? 'auto') as 'auto' | 'next' | 'react-router',
    format: (flag(argv, '--format') ?? 'enterprise') as 'enterprise' | 'liveappmap',
    codeDir: flag(argv, '--code-dir') ?? undefined,
  });
  const diagnostics = sortDiagnostics(result.diagnostics);
  printDiagnostics(io, diagnostics, true);
  const hasError = diagnostics.some((d) => d.severity === 'error');
  const doc = result.document;
  io.log(
    json({
      ok: !hasError,
      pages: doc.nodes.filter((n) => n.kind === 'page').length,
      nodes: doc.nodes.length,
      edges: doc.edges.length,
      revision: doc.revision,
      framework: doc.project.framework,
      ...summaryOf(doc.code),
      out: out ?? null,
      timing: result.timing,
    }),
  );
  // NO_APP_DIR / NO_ROUTES_FOUND и прочие error → ненулевой exit для CI.
  return hasError ? 1 : 0;
};

const code: Command = async (argv, io) => {
  const out = outFlag(argv) ?? undefined;
  const format = (flag(argv, '--format') ?? 'enterprise') as 'enterprise' | 'liveappmap';
  const result = runCodeScan({ dir: flag(argv, '--dir') ?? '.', out, format });
  printDiagnostics(io, sortDiagnostics(result.diagnostics), false);
  io.log(json({ ok: true, ...summaryOf(result.document.code), out: out ?? null, ms: result.ms }));
  return 0;
};

const diff: Command = async (argv, io) => {
  const [, left, right] = argv;
  if (!left || !right) {
    return usage(io);
  }
  const d = runDiff(left, right);
  io.log(json(d));
  return diffChangeCount(d) > 0 ? 1 : 0;
};

const doctor: Command = async (argv, io) => {
  io.log(json(runDoctor(flag(argv, '--dir') ?? '.')));
  return 0;
};

const exportCmd: Command = async (argv, io) => {
  const input = argv[1];
  const out = outFlag(argv) ?? 'map.appmap';
  if (!input) {
    return usage(io);
  }
  const parsed = parseAppMapDocument(JSON.parse(readFileSync(input, 'utf8')) as unknown);
  if (!parsed.ok) {
    io.error(parsed.errors.map((e) => e.message).join('\n'));
    return 1;
  }
  const zip = await exportAppMapZip(parsed.document);
  writeFileSync(out, zip);
  io.log(json({ ok: true, out, bytes: zip.byteLength }));
  return 0;
};

/** Замечание Live App Map v1 (поля, которые читает CLI). */
export type FeedbackBody = {
  readonly kind?: string;
  readonly version?: number;
  readonly note?: string;
  readonly promptMarkdown?: string;
  readonly page?: { readonly id?: string; readonly title?: string; readonly path?: string; readonly url?: string };
  readonly severity?: string;
};

/**
 * Проверка текста файла замечания.
 *
 * @param text - содержимое файла
 * @returns замечание или текст ошибки для stderr
 */
export function parseFeedback(text: string): { readonly ok: true; readonly raw: unknown; readonly body: FeedbackBody } | { readonly ok: false; readonly error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `feedback: невалидный JSON (${message})` };
  }
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, error: 'feedback: ожидается объект Live App Map feedback v1' };
  }
  const body = raw as FeedbackBody;
  if (body.kind !== 'live-app-map-feedback' || body.version !== 1) {
    return { ok: false, error: 'feedback: kind должен быть live-app-map-feedback, version 1' };
  }
  if (!body.note || body.note.trim() === '') {
    return { ok: false, error: 'feedback: пустой note' };
  }
  return { ok: true, raw, body };
}

/** Строка по непустому значению, иначе пустая. */
function lineIf(value: string | undefined, line: (v: string) => string): string {
  return value ? line(value) : '';
}

/**
 * Промпт замечания: готовый promptMarkdown, иначе собранный из полей.
 *
 * @param body - проверенное замечание
 * @returns markdown
 */
export function feedbackMarkdown(body: FeedbackBody): string {
  if (typeof body.promptMarkdown === 'string' && body.promptMarkdown.length > 0) {
    return body.promptMarkdown;
  }
  const page = body.page ?? {};
  const pageId = page.id ?? 'unknown';
  return [
    '# Live App Map feedback',
    '',
    `Severity: ${body.severity ?? 'medium'}`,
    `Page: ${page.title ?? pageId} (\`${pageId}\`)`,
    lineIf(page.path, (p) => `Path: \`${p}\``),
    lineIf(page.url, (u) => `URL: ${u}`),
    '',
    '## Note',
    body.note,
    '',
  ].join('\n');
}

const feedback: Command = async (argv, io) => {
  const file = flag(argv, '--file') ?? flag(argv, '-f');
  if (!file) {
    return usage(io);
  }
  const parsed = parseFeedback(readFileSync(file, 'utf8'));
  if (!parsed.ok) {
    io.error(parsed.error);
    return 1;
  }
  const { raw, body } = parsed;
  const outDir = path.join(io.cwd, '.lam-feedback');
  mkdirSync(outDir, { recursive: true });
  const stamp = io.now().toISOString().replace(/[:.]/g, '-');
  const pageId = body.page?.id ?? 'unknown';
  const base = path.join(outDir, `${stamp}-${pageId.replace(/[^a-zA-Z0-9_-]+/g, '_')}`);
  const outJson = `${base}.json`;
  const outMd = `${base}.md`;
  writeFileSync(outJson, `${json(raw)}\n`, 'utf8');
  const md = feedbackMarkdown(body);
  writeFileSync(outMd, md.endsWith('\n') ? md : `${md}\n`, 'utf8');
  if (argv.includes('--print-prompt')) {
    io.log(md);
  }
  io.log(
    json({
      ok: true,
      pageId,
      severity: body.severity ?? 'medium',
      outJson,
      outMd,
      next: 'Передайте .md промпт агенту или откройте visualizer feedback panel',
    }),
  );
  return 0;
};

const dev: Command = async (argv, io) => {
  const target = flag(argv, '--target-url') ?? 'http://localhost:3000';
  const port = Number(flag(argv, '--port') ?? '4310');
  const mapFile = flag(argv, '--map');
  const visualizerUrl = `http://localhost:${port}/?baseUrl=${encodeURIComponent(target)}`;
  const message = `Следующий шаг: bun run dev (порт ${port}). Откройте ${visualizerUrl}${mapFile !== null ? ` (карта: ${mapFile})` : ''}`;
  io.error(message);
  io.log(
    json({
      ok: true,
      mode: 'dev-sidecar-hint',
      message,
      command: 'bun run dev',
      targetUrl: target,
      port,
      mapFile,
      visualizerHint: visualizerUrl,
    }),
  );
  return 0;
};

/** Клон Live App Map, из которого запущен CLI (packages/cli/src → корень). */
const LAM_HOME = path.resolve(import.meta.dir, '../../..');

const init: Command = async (argv, io) => {
  const projectDir = path.resolve(io.cwd, flag(argv, '--project') ?? '.');
  const report = await runInit({
    projectDir,
    tarball: flag(argv, '--tarball'),
    skillSource: path.join(LAM_HOME, 'skills', 'live-app-map', 'SKILL.md'),
  });
  io.log(initSummary(report, LAM_HOME, projectDir));
  return 0;
};

const COMMANDS = new Map<string, Command>([
  ['scan', scan],
  ['code', code],
  ['diff', diff],
  ['doctor', doctor],
  ['export', exportCmd],
  ['feedback', feedback],
  ['dev', dev],
  ['init', init],
]);

/**
 * Выполняет команду CLI.
 *
 * @param argv - аргументы без bun и пути скрипта
 * @param io - вывод и окружение
 * @returns код выхода
 */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const command = COMMANDS.get(argv[0] ?? '');
  return command === undefined ? usage(io) : command(argv, io);
}
