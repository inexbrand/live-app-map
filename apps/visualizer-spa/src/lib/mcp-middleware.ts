/**
 * MCP по HTTP на dev-сервере визуализатора: `POST /mcp` (JSON-RPC 2.0).
 * Те же tools, что у stdio-сервера `bun run mcp`; агент подключается к
 * `http://localhost:4310/mcp`. Потока SSE нет — GET отвечает 405, как
 * разрешает транспорт Streamable HTTP.
 */
import { handleRpcText, resolveLamDir } from '@live-app-map/mcp-server';
import {
  localEndpointMiddleware,
  readBody,
  rejectMethod,
  sendError,
  sendJson,
  type DevMiddleware,
} from './dev-http';

/** Путь эндпоинта. */
export const MCP_PATH = '/mcp';

const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Создаёт MCP-middleware.
 *
 * @param options - папка обмена для tools
 */
export function createMcpAgentMiddleware(options: { readonly lamDir: string }): DevMiddleware {
  const ctx = { lamDir: options.lamDir };
  return localEndpointMiddleware({
    matches: (p) => p === MCP_PATH,
    errorStatus: 500,
    handle: async (req, res) => {
      if (req.method !== 'POST') {
        rejectMethod(res, 'POST', 'только POST (JSON-RPC)');
        return;
      }
      const body = await readBody(req, MAX_BODY_BYTES);
      if (!body.ok) {
        sendError(res, body.status, body.error);
        return;
      }
      const response = handleRpcText(body.text, ctx);
      if (response === null) {
        // уведомление JSON-RPC — без тела
        res.statusCode = 202;
        res.end();
        return;
      }
      sendJson(res, 200, response);
    },
  });
}

/** Middleware для vite.config: папка обмена в корне монорепо. */
export const mcpAgentMiddleware: DevMiddleware = createMcpAgentMiddleware({
  lamDir: resolveLamDir(process.cwd()),
});
