#!/usr/bin/env bun
/**
 * MCP stdio-сервер Live App Map: JSON-RPC 2.0, одно сообщение на строку.
 * Tools — см. `tools.ts`; тот же набор отдаёт dev-сервер визуализатора на POST /mcp.
 *
 * Запуск: `bun run packages/mcp-server/src/server.ts` (или `bun run mcp`).
 */
import { resolveLamDir } from './lam-dir';
import { serveLines } from './stdio';

serveLines(Bun.stdin.stream(), (line) => process.stdout.write(line), { lamDir: resolveLamDir(process.cwd()) }).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
