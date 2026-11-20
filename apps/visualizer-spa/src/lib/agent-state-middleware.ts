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
import type { ZodType } from 'zod';
import {
  isLocalOrigin,
  parseJsonText,
  readBody,
  requestPath,
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

async function readValid<T>(
  req: Req,
  res: Res,
  schema: ZodType<T>,
  maxBytes: number,
): Promise<T | null> {
  const body = await readBody(req, maxBytes);
  if (!body.ok) {
    sendJson(res, body.status, { ok: false, error: body.error });
    return null;
  }
  const parsed = schema.safeParse(parseJsonText(body.text)?.value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    sendJson(res, 400, { ok: false, error: `${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'неверное тело'}` });
    return null;
  }
  return parsed.data;
}

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
    res.setHeader('allow', 'GET, POST');
    sendJson(res, 405, { ok: false, error: 'только GET и POST' });
    return;
  }
  const state = await readValid(req, res, visualizerStateSchema, MAX_STATE_BYTES);
  if (state !== null) {
    writeVisualizerState(lamDir, state);
    sendJson(res, 200, { ok: true });
  }
}

async function handleSnapshot(req: Req, res: Res, lamDir: string): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'только POST' });
    return;
  }
  // base64 раздувает PNG на 4/3 + JSON-обёртка
  const upload = await readValid(req, res, snapshotUploadSchema, Math.ceil(MAX_SNAPSHOT_BYTES * 1.4));
  if (upload === null) {
    return;
  }
  try {
    sendJson(res, 201, { ok: true, snapshot: saveSnapshot(lamDir, upload) });
  } catch (err) {
    sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Создаёт middleware состояния агента.
 *
 * @param options - папка обмена
 */
export function createAgentStateMiddleware(options: { readonly lamDir: string }): DevMiddleware {
  return (req, res, next) => {
    const p = requestPath(req);
    if (p !== AGENT_STATE_PATH && p !== AGENT_SNAPSHOT_PATH) {
      next();
      return;
    }
    if (!isLocalOrigin(req)) {
      sendJson(res, 403, { ok: false, error: 'origin не локальный' });
      return;
    }
    const work = p === AGENT_STATE_PATH ? handleState(req, res, options.lamDir) : handleSnapshot(req, res, options.lamDir);
    void work.catch((err: unknown) => {
      sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
    });
  };
}

/** Middleware для vite.config: папка обмена в корне монорепо. */
export const agentStateMiddleware: DevMiddleware = createAgentStateMiddleware({
  lamDir: resolveLamDir(process.cwd()),
});
