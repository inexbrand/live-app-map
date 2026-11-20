#!/usr/bin/env bun
/**
 * MCP stdio-сервер Live App Map: JSON-RPC 2.0, одно сообщение на строку.
 * Tools — см. `tools.ts`; тот же набор отдаёт dev-сервер визуализатора на POST /mcp.
 *
 * Запуск: `bun run packages/mcp-server/src/server.ts` (или `bun run mcp`).
 */
import { resolveLamDir } from './lam-dir';
import { handleRpcText } from './rpc';

async function main(): Promise<void> {
  const ctx = { lamDir: resolveLamDir(process.cwd()) };
  const reader = Bun.stdin.stream().getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf('\n');
    while (idx >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line !== '') {
        const response = handleRpcText(line, ctx);
        if (response !== null) {
          process.stdout.write(`${JSON.stringify(response)}\n`);
        }
      }
      idx = buffer.indexOf('\n');
    }
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
