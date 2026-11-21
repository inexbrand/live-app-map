#!/usr/bin/env bun
/**
 * CLI: live-app-map scan | diff | doctor | dev
 */
import { formatDiagnostic, sortDiagnostics } from '@live-app-map/diagnostics';
import { diffChangeCount } from '@live-app-map/graph';
import { runCodeScan, runDiff, runDoctor, runScan } from './index';
import type { CodeModel } from '@live-app-map/schema';

function usage(): never {
  console.log(`live-app-map — scanner & tools

Usage:
  live-app-map scan --dir <path> [-o out.json] [--base-url url] [--framework next|react-router|auto] [--code-dir <path>] [--format enterprise|liveappmap]
  live-app-map code --dir <path> [-o out.json] [--format enterprise|liveappmap]
  live-app-map diff <left.json> <right.json>
  live-app-map doctor [--dir <path>]
  live-app-map export <appmap.json> -o map.appmap
  live-app-map feedback --file feedback.json [--print-prompt]
  live-app-map dev --target-url <url> [--port 4310] [--map <file.json>]

Examples:
  live-app-map scan --dir ../korbor/apps/miniapp --base-url https://vite.localhost:5175 -o maps/miniapp.json
  live-app-map doctor --dir ../korbor/apps/site
  live-app-map code --dir ../korbor -o maps/korbor-code.json
  live-app-map scan --dir ../korbor/apps/miniapp --code-dir ../korbor -o maps/miniapp-with-code.json
  live-app-map export maps/korbor-miniapp.json -o maps/korbor-miniapp.appmap
  live-app-map feedback --file lam-feedback-route_feed.json --print-prompt
`);
  process.exit(1);
}

async function main(argv: string[]): Promise<void> {
  const cmd = argv[0] ?? '';
  if (!cmd || cmd === '-h' || cmd === '--help') {
    usage();
  }

  if (cmd === 'scan') {
    const dir = flag(argv, '--dir') ?? '.';
    const out = flag(argv, '-o') ?? flag(argv, '--out');
    const baseUrl = flag(argv, '--base-url');
    const framework = (flag(argv, '--framework') ?? 'auto') as
      | 'auto'
      | 'next'
      | 'react-router';
    const format = (flag(argv, '--format') ?? 'enterprise') as
      | 'enterprise'
      | 'liveappmap';
    const codeDir = flag(argv, '--code-dir');
    const result = await runScan({
      dir,
      out: out ?? undefined,
      baseUrl: baseUrl ?? undefined,
      framework,
      format,
      codeDir: codeDir ?? undefined,
    });
    const diagnostics = sortDiagnostics(result.diagnostics);
    for (const d of diagnostics) {
      // Человекочитаемый stderr: severity/code/message (+ hint из каталога).
      console.error(formatDiagnostic(d));
      if (d.hint !== undefined && d.hint.length > 0) {
        console.error(`  подсказка: ${d.hint}`);
      }
    }
    const hasError = diagnostics.some((d) => d.severity === 'error');
    const pages = result.document.nodes.filter((n) => n.kind === 'page').length;
    console.log(
      JSON.stringify(
        {
          ok: !hasError,
          pages,
          nodes: result.document.nodes.length,
          edges: result.document.edges.length,
          revision: result.document.revision,
          framework: result.document.project.framework,
          ...(result.document.code === undefined ? {} : codeSummary(result.document.code)),
          out: out ?? null,
          timing: result.timing,
        },
        null,
        2,
      ),
    );
    // NO_APP_DIR / NO_ROUTES_FOUND и прочие error → ненулевой exit для CI.
    if (hasError) {
      process.exit(1);
    }
    return;
  }

  if (cmd === 'code') {
    const dir = flag(argv, '--dir') ?? '.';
    const out = flag(argv, '-o') ?? flag(argv, '--out');
    const format = (flag(argv, '--format') ?? 'enterprise') as 'enterprise' | 'liveappmap';
    const result = runCodeScan({ dir, out: out ?? undefined, format });
    for (const d of sortDiagnostics(result.diagnostics)) {
      console.error(formatDiagnostic(d));
    }
    const code = result.document.code;
    console.log(
      JSON.stringify(
        { ok: true, ...(code === undefined ? {} : codeSummary(code)), out: out ?? null, ms: result.ms },
        null,
        2,
      ),
    );
    return;
  }

  if (cmd === 'diff') {
    const left = argv[1];
    const right = argv[2];
    if (!left || !right) {
      usage();
    }
    const d = runDiff(left, right);
    console.log(JSON.stringify(d, null, 2));
    process.exit(diffChangeCount(d) > 0 ? 1 : 0);
  }

  if (cmd === 'doctor') {
    const dir = flag(argv, '--dir') ?? '.';
    console.log(JSON.stringify(runDoctor(dir), null, 2));
    return;
  }

  if (cmd === 'export') {
    const input = argv[1];
    const out = flag(argv, '-o') ?? flag(argv, '--out') ?? 'map.appmap';
    if (!input) {
      usage();
    }
    const { readFileSync, writeFileSync } = await import('node:fs');
    const { parseAppMapDocument } = await import('@live-app-map/schema');
    const { exportAppMapZip } = await import('@live-app-map/export-appmap');
    const raw = JSON.parse(readFileSync(input, 'utf8')) as unknown;
    const parsed = parseAppMapDocument(raw);
    if (!parsed.ok) {
      console.error(parsed.errors.map((e) => e.message).join('\n'));
      process.exit(1);
    }
    const zip = await exportAppMapZip(parsed.document);
    writeFileSync(out, zip);
    console.log(JSON.stringify({ ok: true, out, bytes: zip.byteLength }, null, 2));
    return;
  }

  if (cmd === 'feedback') {
    const file = flag(argv, '--file') ?? flag(argv, '-f');
    const printPrompt = argv.includes('--print-prompt');
    if (!file) {
      usage();
    }
    const { readFileSync, writeFileSync, mkdirSync } = await import('node:fs');
    const path = await import('node:path');
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`feedback: невалидный JSON (${message})`);
      process.exit(1);
    }
    if (raw === null || typeof raw !== 'object') {
      console.error('feedback: ожидается объект Live App Map feedback v1');
      process.exit(1);
    }
    const body = raw as {
      kind?: string;
      version?: number;
      note?: string;
      promptMarkdown?: string;
      page?: { id?: string; title?: string; path?: string; url?: string };
      severity?: string;
    };
    if (body.kind !== 'live-app-map-feedback' || body.version !== 1) {
      console.error('feedback: kind должен быть live-app-map-feedback, version 1');
      process.exit(1);
    }
    if (!body.note || body.note.trim() === '') {
      console.error('feedback: пустой note');
      process.exit(1);
    }
    const outDir = path.join(process.cwd(), '.lam-feedback');
    mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const pageId = body.page?.id ?? 'unknown';
    const safeId = pageId.replace(/[^a-zA-Z0-9_-]+/g, '_');
    const outJson = path.join(outDir, `${stamp}-${safeId}.json`);
    const outMd = path.join(outDir, `${stamp}-${safeId}.md`);
    writeFileSync(outJson, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
    const md =
      typeof body.promptMarkdown === 'string' && body.promptMarkdown.length > 0
        ? body.promptMarkdown
        : [
            '# Live App Map feedback',
            '',
            `Severity: ${body.severity ?? 'medium'}`,
            `Page: ${body.page?.title ?? pageId} (\`${pageId}\`)`,
            body.page?.path ? `Path: \`${body.page.path}\`` : '',
            body.page?.url ? `URL: ${body.page.url}` : '',
            '',
            '## Note',
            body.note,
            '',
          ]
            .filter((l) => l !== undefined)
            .join('\n');
    writeFileSync(outMd, md.endsWith('\n') ? md : `${md}\n`, 'utf8');
    if (printPrompt) {
      console.log(md);
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          pageId,
          severity: body.severity ?? 'medium',
          outJson,
          outMd,
          next: 'Передайте .md промпт агенту или откройте visualizer feedback panel',
        },
        null,
        2,
      ),
    );
    return;
  }

  if (cmd === 'dev') {
    const target = flag(argv, '--target-url') ?? 'http://localhost:3000';
    const port = Number(flag(argv, '--port') ?? '4310');
    const mapFile = flag(argv, '--map');
    const visualizerUrl = `http://localhost:${port}/?baseUrl=${encodeURIComponent(target)}`;
    const message =
      `Следующий шаг: bun run dev (порт ${port}). ` +
      `Откройте ${visualizerUrl}` +
      (mapFile !== null ? ` (карта: ${mapFile})` : '');
    console.error(message);
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: 'dev-sidecar-hint',
          message,
          command: 'bun run dev',
          targetUrl: target,
          port,
          mapFile,
          visualizerHint: visualizerUrl,
        },
        null,
        2,
      ),
    );
    return;
  }

  usage();
}

/**
 * Сводка раздела code для вывода CLI.
 *
 * @param code - раздел code
 * @returns числа сервисов, роутов, таблиц, символов
 */
function codeSummary(code: CodeModel): Record<string, number> {
  return {
    services: code.services.length,
    routes: code.routes.length,
    routesWithDoc: code.routes.filter((r) => r.doc !== undefined).length,
    routesWithDb: code.routes.filter((r) => r.dbCalls.length > 0).length,
    routesWithDbInLoop: code.routes.filter((r) => r.dbCalls.some((c) => c.inLoop === true)).length,
    tables: code.tables.length,
    symbols: code.symbols.length,
    apiCalls: code.apiCalls?.length ?? 0,
    apiCallsMatched: (code.apiCalls ?? []).filter((c) => c.routeId !== undefined).length,
    screensWithApi: (code.screens ?? []).filter((s) => s.calls.length > 0).length,
  };
}

function flag(argv: string[], name: string): string | null {
  const i = argv.indexOf(name);
  if (i === -1) {
    return null;
  }
  return argv[i + 1] ?? null;
}

main(process.argv.slice(2)).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
