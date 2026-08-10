#!/usr/bin/env bun
/**
 * Minimal MCP-style stdio tool server for Live App Map.
 * Tools: list_map_pages, get_page, submit_feedback, list_feedback.
 *
 * Протокол упрощённый JSON-RPC 2.0 over stdin/stdout (tools/list, tools/call).
 * Не тянет SDK — канон dogfood: `bun run packages/mcp-server/src/server.ts`.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseLiveAppMapJson, parseAppMapDocument } from '@live-app-map/schema';

const FEEDBACK_DIR = path.join(process.cwd(), '.lam-feedback');

type JsonRpcReq = {
  readonly jsonrpc?: string;
  readonly id?: string | number | null;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
};

type ToolDef = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
};

const TOOLS: ToolDef[] = [
  {
    name: 'list_map_pages',
    description: 'Список pages из liveappmap / enterprise JSON файла карты',
    inputSchema: {
      type: 'object',
      required: ['mapPath'],
      properties: {
        mapPath: { type: 'string', description: 'Путь к .json карте' },
      },
    },
  },
  {
    name: 'get_page',
    description: 'Детали page по id из карты',
    inputSchema: {
      type: 'object',
      required: ['mapPath', 'pageId'],
      properties: {
        mapPath: { type: 'string' },
        pageId: { type: 'string' },
      },
    },
  },
  {
    name: 'submit_feedback',
    description:
      'Сохранить feedback v1 (note + page) в .lam-feedback/ и вернуть пути артефактов',
    inputSchema: {
      type: 'object',
      required: ['feedback'],
      properties: {
        feedback: { type: 'object', description: 'live-app-map-feedback v1 object' },
      },
    },
  },
  {
    name: 'list_feedback',
    description: 'Список сохранённых feedback JSON в .lam-feedback/',
    inputSchema: { type: 'object', properties: {} },
  },
];

function loadMap(mapPath: string): {
  pages: Array<Record<string, unknown>>;
  baseUrl?: string;
  name?: string;
} {
  const abs = path.resolve(mapPath);
  const text = readFileSync(abs, 'utf8');
  const raw = JSON.parse(text) as unknown;
  const asApp = parseAppMapDocument(raw);
  if (asApp.ok) {
    return {
      pages: asApp.document.nodes
        .filter((n) => n.kind === 'page')
        .map((n) => ({
          id: n.id,
          title: n.title,
          path: n.pathExample ?? n.pathPattern,
          url: n.url,
          states: n.states,
        })),
      baseUrl: asApp.document.baseUrl ?? undefined,
      name: asApp.document.project.name,
    };
  }
  const asLive = parseLiveAppMapJson(text);
  if (asLive.ok) {
    return {
      pages: asLive.document.pages.map((p) => ({
        id: p.id,
        title: p.title,
        path: p.path,
        url: p.url,
        states: p.states,
      })),
      baseUrl: asLive.document.baseUrl,
      name: asLive.document.app?.name,
    };
  }
  throw new Error('map parse failed');
}

function callTool(
  name: string,
  args: Record<string, unknown>,
): { content: Array<{ type: string; text: string }>; isError?: boolean } {
  try {
    if (name === 'list_map_pages') {
      const mapPath = String(args['mapPath'] ?? '');
      const map = loadMap(mapPath);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { ok: true, name: map.name, baseUrl: map.baseUrl, pages: map.pages },
              null,
              2,
            ),
          },
        ],
      };
    }
    if (name === 'get_page') {
      const mapPath = String(args['mapPath'] ?? '');
      const pageId = String(args['pageId'] ?? '');
      const map = loadMap(mapPath);
      const page = map.pages.find((p) => p['id'] === pageId);
      if (!page) {
        return {
          isError: true,
          content: [{ type: 'text', text: `page not found: ${pageId}` }],
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, page }, null, 2) }],
      };
    }
    if (name === 'submit_feedback') {
      const feedback = args['feedback'];
      if (feedback === null || typeof feedback !== 'object') {
        return {
          isError: true,
          content: [{ type: 'text', text: 'feedback object required' }],
        };
      }
      mkdirSync(FEEDBACK_DIR, { recursive: true });
      const fb = feedback as {
        page?: { id?: string };
        promptMarkdown?: string;
      };
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safe = String(fb.page?.id ?? 'feedback').replace(/[^a-zA-Z0-9_-]+/g, '_');
      const jsonPath = path.join(FEEDBACK_DIR, `${stamp}-${safe}.json`);
      const mdPath = path.join(FEEDBACK_DIR, `${stamp}-${safe}.md`);
      writeFileSync(jsonPath, `${JSON.stringify(feedback, null, 2)}\n`, 'utf8');
      if (typeof fb.promptMarkdown === 'string') {
        writeFileSync(mdPath, fb.promptMarkdown.endsWith('\n') ? fb.promptMarkdown : `${fb.promptMarkdown}\n`);
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ok: true, jsonPath, mdPath }, null, 2),
          },
        ],
      };
    }
    if (name === 'list_feedback') {
      if (!existsSync(FEEDBACK_DIR)) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, files: [] }) }],
        };
      }
      const files = readdirSync(FEEDBACK_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => path.join(FEEDBACK_DIR, f));
      return {
        content: [
          { type: 'text', text: JSON.stringify({ ok: true, files }, null, 2) },
        ],
      };
    }
    return {
      isError: true,
      content: [{ type: 'text', text: `unknown tool: ${name}` }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: 'text', text: message }] };
  }
}

function respond(id: string | number | null | undefined, result: unknown): void {
  const msg = {
    jsonrpc: '2.0',
    id: id ?? null,
    result,
  };
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function respondError(
  id: string | number | null | undefined,
  code: number,
  message: string,
): void {
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })}\n`,
  );
}

async function main(): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of Bun.stdin.stream()) {
    buffer += decoder.decode(chunk);
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) {
        continue;
      }
      let req: JsonRpcReq;
      try {
        req = JSON.parse(line) as JsonRpcReq;
      } catch {
        respondError(null, -32700, 'parse error');
        continue;
      }
      const method = req.method ?? '';
      if (method === 'initialize') {
        respond(req.id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'live-app-map-mcp', version: '0.1.0' },
        });
        continue;
      }
      if (method === 'tools/list') {
        respond(req.id, { tools: TOOLS });
        continue;
      }
      if (method === 'tools/call') {
        const params = req.params ?? {};
        const name = String(params['name'] ?? '');
        const args =
          params['arguments'] !== null && typeof params['arguments'] === 'object'
            ? (params['arguments'] as Record<string, unknown>)
            : {};
        const out = callTool(name, args);
        respond(req.id, out);
        continue;
      }
      if (method === 'ping') {
        respond(req.id, {});
        continue;
      }
      respondError(req.id, -32601, `method not found: ${method}`);
    }
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
