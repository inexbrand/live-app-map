/**
 * Мост визуализатор ↔ агент на dev-сервере:
 * - `GET  /api/agent-state` — опубликованное состояние и невыполненная просьба снимка;
 * - `POST /api/agent-state` — визуализатор публикует, что сейчас открыто;
 * - `POST /api/agent-state/snapshot` — PNG снимка (ответ на просьбу агента или свой).
 * Хранилище — файлы `@live-app-map/mcp-server` (их же читает stdio MCP).
 */
import {
  MAX_SNAPSHOT_BYTES,
  readPendingSnapshotRequest,
  readVisualizerState,
  resolveLamDir,
  saveSnapshot,
  snapshotUploadSchema,
  visualizerStateSchema,
  writeVisualizerState,
} from '@live-app-map/mcp-server';
import {
  errorMessage,
  localEndpointMiddleware,
  readValidJson,
  rejectMethod,
  sendError,
  sendJson,
  type DevMiddleware,
} from './dev-http';

/** Путь состояния. */
export const AGENT_STATE_PATH = '/api/agent-state';

/** Путь загрузки снимка. */
export const AGENT_SNAPSHOT_PATH = '/api/agent-state/snapshot';

const MAX_STATE_BYTES = 64 * 1024;

type Req = Parameters<DevMiddleware>[0];
type Res = Parameters<DevMiddleware>[1];

async function handleState(req: Req, res: Res, lamDir: string): Promise<void> {
  if (req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      state: readVisualizerState(lamDir),
      pendingSnapshotRequest: readPendingSnapshotRequest(lamDir),
    });
    return;
  }
  if (req.method !== 'POST') {
    rejectMethod(res, 'GET, POST', 'только GET и POST');
    return;
  }
  const state = await readValidJson(req, res, visualizerStateSchema, MAX_STATE_BYTES);
  if (state !== null) {
    writeVisualizerState(lamDir, state);
    sendJson(res, 200, { ok: true });
  }
}

async function handleSnapshot(req: Req, res: Res, lamDir: string): Promise<void> {
  if (req.method !== 'POST') {
    rejectMethod(res, 'POST', 'только POST');
    return;
  }
  // base64 раздувает PNG на 4/3 + JSON-обёртка
  const upload = await readValidJson(req, res, snapshotUploadSchema, Math.ceil(MAX_SNAPSHOT_BYTES * 1.4));
  if (upload === null) {
    return;
  }
  try {
    sendJson(res, 201, { ok: true, snapshot: saveSnapshot(lamDir, upload) });
  } catch (err) {
    sendError(res, 400, errorMessage(err));
  }
}

/**
 * Создаёт middleware состояния агента.
 *
 * @param options - папка обмена
 */
export function createAgentStateMiddleware(options: { readonly lamDir: string }): DevMiddleware {
  return localEndpointMiddleware({
    matches: (p) => p === AGENT_STATE_PATH || p === AGENT_SNAPSHOT_PATH,
    errorStatus: 500,
    handle: (req, res, p) =>
      p === AGENT_STATE_PATH ? handleState(req, res, options.lamDir) : handleSnapshot(req, res, options.lamDir),
  });
}

/** Middleware для vite.config: папка обмена в корне монорепо. */
export const agentStateMiddleware: DevMiddleware = createAgentStateMiddleware({
  lamDir: resolveLamDir(process.cwd()),
});
