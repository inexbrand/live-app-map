/**
 * MCP tools замечаний к экранам: агент читает замечания, отвечает, что
 * изменил, и меняет статус. Хранилище — comments-store (.lam-feedback/comments).
 */
import {
  addCommentEvent,
  commentAuthorSchema,
  commentShotPath,
  commentStatusSchema,
  createComment,
  listComments,
  newCommentId,
  readComment,
  type CommentFilter,
  type CommentThread,
} from './comments-store';
import type { ToolContext, ToolDef, ToolResult } from './tools';

type Args = Readonly<Record<string, unknown>>;
type Handler = (args: Args, ctx: ToolContext) => ToolResult;

function ok(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function fail(text: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

function str(args: Args, key: string): string {
  const v = args[key];
  return typeof v === 'string' ? v.trim() : '';
}

function strList(args: Args, key: string): string[] {
  const v = args[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
}

const str_ = (description: string) => ({ type: 'string', description });

/** Каталог tools замечаний. */
export const COMMENT_TOOLS: readonly ToolDef[] = [
  {
    name: 'list_comments',
    description:
      'Замечания пользователя к экранам и компонентам (визуализатор): текст, экран, компонент, файл:строка, статус. Исправив — add_change_note.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'fixed'], description: 'open — ждут исправления' },
        pageId: str_('id экрана'),
        mapName: str_('имя карты'),
        author: { type: 'string', enum: ['user', 'agent'] },
        query: str_('подстрока текста, экрана или компонента'),
      },
    },
  },
  {
    name: 'get_comment',
    description: 'Ветка замечания целиком: привязка к элементу (селектор, путь DOM, рамка, компонент), события, путь к снимку PNG',
    inputSchema: { type: 'object', required: ['id'], properties: { id: str_('id замечания') } },
  },
  {
    name: 'add_change_note',
    description:
      'Ответ агента «что изменил»: текст, файлы, коммит. С commentId — в ветку замечания (resolve=true по умолчанию ставит «исправлено»); без commentId — новая заметка агента к экрану pageId (и элементу selector).',
    inputSchema: {
      type: 'object',
      required: ['text'],
      properties: {
        commentId: str_('id замечания, на которое отвечаем'),
        text: str_('что изменено и почему'),
        files: { type: 'array', items: { type: 'string' }, description: 'изменённые файлы от корня репозитория' },
        commit: str_('хэш коммита'),
        resolve: { type: 'boolean', description: 'поставить «исправлено» (по умолчанию true)' },
        pageId: str_('экран для новой заметки (без commentId)'),
        pageTitle: str_('название экрана для новой заметки'),
        mapName: str_('карта для новой заметки'),
        selector: str_('CSS-селектор элемента для новой заметки'),
      },
    },
  },
  {
    name: 'resolve_comment',
    description: 'Пометить замечание исправленным (статус fixed)',
    inputSchema: { type: 'object', required: ['id'], properties: { id: str_('id замечания'), note: str_('пояснение') } },
  },
  {
    name: 'reopen_comment',
    description: 'Снова открыть замечание (статус open)',
    inputSchema: { type: 'object', required: ['id'], properties: { id: str_('id замечания'), note: str_('почему') } },
  },
];

/** Короткий вид ветки для списка. */
function summary(t: CommentThread): Record<string, unknown> {
  const el = t.anchor.element;
  return {
    id: t.id,
    status: t.status,
    author: t.author,
    text: t.text,
    map: t.anchor.mapName,
    page: { id: t.anchor.pageId, title: t.anchor.pageTitle, url: t.anchor.pageUrl },
    element: el === null ? null : { selector: el.selector, text: el.text, component: el.component?.name ?? null, source: el.component?.source ?? null },
    replies: t.events.filter((e) => e.type === 'reply').length,
    updatedAt: t.updatedAt,
  };
}

function filterOf(args: Args): CommentFilter | string {
  const status = str(args, 'status');
  const author = str(args, 'author');
  const st = commentStatusSchema.safeParse(status);
  const au = commentAuthorSchema.safeParse(author);
  if (status !== '' && !st.success) {
    return 'status: open или fixed';
  }
  if (author !== '' && !au.success) {
    return 'author: user или agent';
  }
  const opt = (k: string): string | undefined => (str(args, k) === '' ? undefined : str(args, k));
  return {
    ...(st.success ? { status: st.data } : {}),
    ...(au.success ? { author: au.data } : {}),
    pageId: opt('pageId'),
    mapName: opt('mapName'),
    query: opt('query'),
  };
}

function withShot(ctx: ToolContext, t: CommentThread): Record<string, unknown> {
  return { ...t, shotPath: commentShotPath(ctx.lamDir, t) };
}

function addChangeNote(args: Args, ctx: ToolContext): ToolResult {
  const text = str(args, 'text');
  if (text === '') {
    return fail('text: напишите, что изменено');
  }
  const files = strList(args, 'files');
  const commit = str(args, 'commit') === '' ? null : str(args, 'commit');
  const commentId = str(args, 'commentId');
  if (commentId !== '') {
    addCommentEvent(ctx.lamDir, commentId, { type: 'reply', author: 'agent', text, files, commit });
    const thread = args['resolve'] === false
      ? readComment(ctx.lamDir, commentId)
      : addCommentEvent(ctx.lamDir, commentId, { type: 'status', author: 'agent', status: 'fixed', note: null });
    return thread === null ? fail(`замечание ${commentId} не найдено`) : ok({ ok: true, comment: summary(thread) });
  }
  const pageId = str(args, 'pageId');
  if (pageId === '') {
    return fail('нужен commentId (ответ на замечание) или pageId (новая заметка к экрану)');
  }
  const selector = str(args, 'selector');
  const filesLine = files.length === 0 ? '' : `\n\nФайлы: ${files.join(', ')}`;
  const thread = createComment(ctx.lamDir, {
    id: newCommentId(),
    author: 'agent',
    text: `${text}${filesLine}${commit === null ? '' : `\nКоммит: ${commit}`}`,
    shotDataUrl: null,
    anchor: {
      mapName: str(args, 'mapName') === '' ? null : str(args, 'mapName'),
      pageId,
      pageTitle: str(args, 'pageTitle') === '' ? pageId : str(args, 'pageTitle'),
      pageUrl: null,
      role: null,
      element: selector === ''
        ? null
        : { selector, domPath: selector, tag: '', text: '', rect: { x: 0, y: 0, width: 0, height: 0 }, viewport: { width: 1, height: 1 }, component: null },
    },
  });
  return ok({ ok: true, comment: summary(thread) });
}

function setStatus(status: 'open' | 'fixed'): Handler {
  return (args, ctx) => {
    const id = str(args, 'id');
    if (id === '') {
      return fail('id: укажите замечание');
    }
    const note = str(args, 'note') === '' ? null : str(args, 'note');
    return ok({ ok: true, comment: summary(addCommentEvent(ctx.lamDir, id, { type: 'status', author: 'agent', status, note })) });
  };
}

/** Обработчики tools замечаний. */
export const COMMENT_HANDLERS: ReadonlyArray<readonly [string, Handler]> = [
  ['list_comments', (args, ctx) => {
    const filter = filterOf(args);
    if (typeof filter === 'string') {
      return fail(filter);
    }
    const threads = listComments(ctx.lamDir, filter);
    return ok({ ok: true, count: threads.length, comments: threads.map(summary), hint: 'get_comment — привязка и снимок; исправив — add_change_note с commentId' });
  }],
  ['get_comment', (args, ctx) => {
    const t = readComment(ctx.lamDir, str(args, 'id'));
    return t === null ? fail(`замечание ${str(args, 'id')} не найдено`) : ok({ ok: true, comment: withShot(ctx, t) });
  }],
  ['add_change_note', addChangeNote],
  ['resolve_comment', setStatus('fixed')],
  ['reopen_comment', setStatus('open')],
];
