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
import {
  localEndpointMiddleware,
  readValidJson,
  sendError,
  sendJson,
  underPath,
  type DevMiddleware,
} from './dev-http';

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

async function handle(req: Req, res: Res, lamDir: string): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://local');
  const rest = url.pathname.slice(COMMENTS_PATH.length).split('/').filter((p) => p !== '');
  const [id = '', tail = ''] = rest;
  const method = req.method ?? '';
  switch (routeKey(method, rest.length, tail)) {
    case 'GET ':
      sendJson(res, 200, { ok: true, comments: listComments(lamDir, filterOf(url)) });
      return;
    case 'POST ':
      await createFromBody(req, res, lamDir);
      return;
    case 'POST events':
      await addEventFromBody(req, res, lamDir, id);
      return;
    case 'GET shot.png':
      sendShot(res, lamDir, id);
      return;
    default:
      sendError(res, 404, `нет такого действия: ${method} ${url.pathname}`);
  }
}

/** «МЕТОД действие»: корень — пустое действие, `<id>/<действие>` — его имя; иначе пусто. */
function routeKey(method: string, depth: number, tail: string): string {
  if (depth === 0) {
    return `${method} `;
  }
  return depth === 2 ? `${method} ${tail}` : '';
}

async function createFromBody(req: Req, res: Res, lamDir: string): Promise<void> {
  const body = await readValidJson(req, res, createBodySchema, Math.ceil(MAX_SNAPSHOT_BYTES * 1.4));
  if (body !== null) {
    sendJson(res, 201, { ok: true, comment: createComment(lamDir, { ...body, author: 'user', shotDataUrl: body.shotDataUrl }) });
  }
}

async function addEventFromBody(req: Req, res: Res, lamDir: string, id: string): Promise<void> {
  const body = await readValidJson(req, res, eventBodySchema, 64 * 1024);
  if (body === null) {
    return;
  }
  const event: NewCommentEvent = body.type === 'reply'
    ? { type: 'reply', author: 'user', text: body.text, files: [], commit: null }
    : { type: 'status', author: 'user', status: body.status, note: body.note };
  sendJson(res, 200, { ok: true, comment: addCommentEvent(lamDir, id, event) });
}

function sendShot(res: Res, lamDir: string, id: string): void {
  const thread = readComment(lamDir, id);
  const file = thread === null ? null : commentShotPath(lamDir, thread);
  if (file === null) {
    sendError(res, 404, 'снимка нет');
    return;
  }
  res.statusCode = 200;
  res.setHeader('content-type', 'image/png');
  res.setHeader('cache-control', 'private, max-age=31536000, immutable');
  res.end(readFileSync(file));
}

/**
 * Создаёт middleware замечаний.
 *
 * @param options - папка обмена
 */
export function createCommentsMiddleware(options: { readonly lamDir: string }): DevMiddleware {
  return localEndpointMiddleware({
    matches: underPath(COMMENTS_PATH),
    // Ошибки хранилища — пустой текст, нет ветки, неверный id: это ошибки запроса.
    errorStatus: 400,
    handle: (req, res) => handle(req, res, options.lamDir),
  });
}

/** Middleware для vite.config: папка обмена в корне монорепо. */
export const commentsMiddleware: DevMiddleware = createCommentsMiddleware({ lamDir: resolveLamDir(process.cwd()) });
