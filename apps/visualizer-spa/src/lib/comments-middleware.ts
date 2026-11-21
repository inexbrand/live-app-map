/**
 * Замечания к экранам на dev-сервере (те же файлы, что читает MCP):
 * - `GET  /api/comments?status=&pageId=&mapName=&author=&q=` — ветки, свежие сверху;
 * - `POST /api/comments` — новое замечание пользователя (текст, привязка, снимок);
 * - `POST /api/comments/<id>/events` — ответ или смена статуса от пользователя;
 * - `GET  /api/comments/<id>/shot.png` — снимок компонента.
 */
import { readFileSync } from 'node:fs';
import {
  addCommentEvent,
  commentAnchorSchema,
  commentShotPath,
  commentStatusSchema,
  createComment,
  listComments,
  MAX_SNAPSHOT_BYTES,
  readComment,
  resolveLamDir,
  type CommentFilter,
} from '@live-app-map/mcp-server';
import type { NewCommentEvent } from '@live-app-map/mcp-server/comments-schema';
import { z } from 'zod';
import { isLocalOrigin, parseJsonText, readBody, requestPath, sendJson, type DevMiddleware } from './dev-http';

/** Корень эндпоинтов. */
export const COMMENTS_PATH = '/api/comments';

const createBodySchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  anchor: commentAnchorSchema,
  shotDataUrl: z.string().nullable(),
});

const eventBodySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('reply'), text: z.string() }),
  z.object({ type: z.literal('status'), status: commentStatusSchema, note: z.string().nullable() }),
]);

type Req = Parameters<DevMiddleware>[0];
type Res = Parameters<DevMiddleware>[1];

function filterOf(url: URL): CommentFilter {
  const q = (k: string): string | undefined => {
    const v = url.searchParams.get(k)?.trim() ?? '';
    return v === '' ? undefined : v;
  };
  const status = commentStatusSchema.safeParse(q('status'));
  const author = z.enum(['user', 'agent']).safeParse(q('author'));
  return {
    ...(status.success ? { status: status.data } : {}),
    ...(author.success ? { author: author.data } : {}),
    pageId: q('pageId'),
    mapName: q('mapName'),
    query: q('q'),
  };
}

async function readJson<T>(req: Req, res: Res, schema: z.ZodType<T>, maxBytes: number): Promise<T | null> {
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

async function handle(req: Req, res: Res, lamDir: string, url: URL): Promise<void> {
  const rest = url.pathname.slice(COMMENTS_PATH.length).split('/').filter((p) => p !== '');
  if (rest.length === 0 && req.method === 'GET') {
    sendJson(res, 200, { ok: true, comments: listComments(lamDir, filterOf(url)) });
    return;
  }
  if (rest.length === 0 && req.method === 'POST') {
    const body = await readJson(req, res, createBodySchema, Math.ceil(MAX_SNAPSHOT_BYTES * 1.4));
    if (body !== null) {
      sendJson(res, 201, { ok: true, comment: createComment(lamDir, { ...body, author: 'user', shotDataUrl: body.shotDataUrl }) });
    }
    return;
  }
  const [id = '', tail = ''] = rest;
  if (rest.length === 2 && tail === 'events' && req.method === 'POST') {
    const body = await readJson(req, res, eventBodySchema, 64 * 1024);
    if (body !== null) {
      const event: NewCommentEvent = body.type === 'reply'
        ? { type: 'reply', author: 'user', text: body.text, files: [], commit: null }
        : { type: 'status', author: 'user', status: body.status, note: body.note };
      sendJson(res, 200, { ok: true, comment: addCommentEvent(lamDir, id, event) });
    }
    return;
  }
  if (rest.length === 2 && tail === 'shot.png' && req.method === 'GET') {
    const thread = readComment(lamDir, id);
    const file = thread === null ? null : commentShotPath(lamDir, thread);
    if (file === null) {
      sendJson(res, 404, { ok: false, error: 'снимка нет' });
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'image/png');
    res.setHeader('cache-control', 'private, max-age=31536000, immutable');
    res.end(readFileSync(file));
    return;
  }
  sendJson(res, 404, { ok: false, error: `нет такого действия: ${req.method ?? ''} ${url.pathname}` });
}

/**
 * Создаёт middleware замечаний.
 *
 * @param options - папка обмена
 */
export function createCommentsMiddleware(options: { readonly lamDir: string }): DevMiddleware {
  return (req, res, next) => {
    const p = requestPath(req);
    if (p !== COMMENTS_PATH && !p.startsWith(`${COMMENTS_PATH}/`)) {
      next();
      return;
    }
    if (!isLocalOrigin(req)) {
      sendJson(res, 403, { ok: false, error: 'origin не локальный' });
      return;
    }
    const url = new URL(req.url ?? '/', 'http://local');
    void handle(req, res, options.lamDir, url).catch((err: unknown) => {
      // Ошибки хранилища — пустой текст, нет ветки, неверный id: это ошибки запроса.
      sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    });
  };
}

/** Middleware для vite.config: папка обмена в корне монорепо. */
export const commentsMiddleware: DevMiddleware = createCommentsMiddleware({ lamDir: resolveLamDir(process.cwd()) });
