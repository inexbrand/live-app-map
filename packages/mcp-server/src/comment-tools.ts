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
import {
  fail,
  ok,
  optionalStr,
  str,
  stringProp as str_,
  strList,
  type Tool,
  type ToolArgs as Args,
  type ToolContext,
  type ToolHandler as Handler,
  type ToolResult,
} from './tool-kit';

/** Каталог tools замечаний. */
export const COMMENT_TOOLS: readonly Tool[] = [
  {
    name: 'list_comments',
    handler: listCommentsTool,
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
    handler: getCommentTool,
    description: 'Ветка замечания целиком: привязка к элементу (селектор, путь DOM, рамка, компонент), события, путь к снимку PNG',
    inputSchema: { type: 'object', required: ['id'], properties: { id: str_('id замечания') } },
  },
  {
    name: 'add_change_note',
    handler: addChangeNote,
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
    handler: setStatus('fixed'),
    description: 'Пометить замечание исправленным (статус fixed)',
    inputSchema: { type: 'object', required: ['id'], properties: { id: str_('id замечания'), note: str_('пояснение') } },
  },
  {
    name: 'reopen_comment',
    handler: setStatus('open'),
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
  const commit = optionalStr(args, 'commit');
  const commentId = str(args, 'commentId');
  if (commentId !== '') {
    return replyAsFixed(args, ctx, commentId, { text, files, commit });
  }
  return notePage(args, ctx, { text, files, commit });
}

type ChangeNote = { readonly text: string; readonly files: string[]; readonly commit: string | null };

/** Ответ агента в замечание и (кроме resolve: false) статус «исправлено». */
function replyAsFixed(args: Args, ctx: ToolContext, commentId: string, note: ChangeNote): ToolResult {
  addCommentEvent(ctx.lamDir, commentId, { type: 'reply', author: 'agent', ...note });
  const thread = args['resolve'] === false
    ? readComment(ctx.lamDir, commentId)
    : addCommentEvent(ctx.lamDir, commentId, { type: 'status', author: 'agent', status: 'fixed', note: null });
  return thread === null ? fail(`замечание ${commentId} не найдено`) : ok({ ok: true, comment: summary(thread) });
}

/** Новая заметка агента к экрану (и элементу по селектору). */
function notePage(args: Args, ctx: ToolContext, { text, files, commit }: ChangeNote): ToolResult {
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
      mapName: optionalStr(args, 'mapName'),
      pageId,
      pageTitle: optionalStr(args, 'pageTitle') ?? pageId,
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
    const note = optionalStr(args, 'note');
    return ok({ ok: true, comment: summary(addCommentEvent(ctx.lamDir, id, { type: 'status', author: 'agent', status, note })) });
  };
}

function listCommentsTool(args: Args, ctx: ToolContext): ToolResult {
  const filter = filterOf(args);
  if (typeof filter === 'string') {
    return fail(filter);
  }
  const threads = listComments(ctx.lamDir, filter);
  return ok({ ok: true, count: threads.length, comments: threads.map(summary), hint: 'get_comment — привязка и снимок; исправив — add_change_note с commentId' });
}

function getCommentTool(args: Args, ctx: ToolContext): ToolResult {
  const t = readComment(ctx.lamDir, str(args, 'id'));
  return t === null ? fail(`замечание ${str(args, 'id')} не найдено`) : ok({ ok: true, comment: withShot(ctx, t) });
}
