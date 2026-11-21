/**
 * MCP tools Live App Map: карта, feedback, состояние визуализатора, снимки.
 * Общие для stdio-сервера и HTTP-эндпоинта dev-сервера визуализатора.
 */
import {
  readLatestSnapshot,
  readPendingSnapshotRequest,
  readVisualizerState,
  writeSnapshotRequest,
} from './agent-state';
import { CODE_TOOLS } from './code-tools';
import { COMMENT_TOOLS } from './comment-tools';
import { DOCS_TOOLS } from './docs-tools';
import { listFeedback, saveFeedback } from './feedback-store';
import { loadMap } from './map-tools';
import {
  fail,
  ok,
  optionalStr,
  rawStr,
  stringProp,
  toolCatalog,
  type Tool,
  type ToolArgs,
  type ToolContext,
  type ToolDef,
  type ToolHandler,
  type ToolResult,
} from './tool-kit';

export type { ToolContext, ToolDef, ToolResult } from './tool-kit';

const mapPathProp = stringProp('Путь к .json карте');

function getPage(args: ToolArgs): ToolResult {
  const pageId = rawStr(args, 'pageId');
  const page = loadMap(rawStr(args, 'mapPath')).pages.find((p) => p.id === pageId);
  return page === undefined ? fail(`page not found: ${pageId}`) : ok({ ok: true, page });
}

function submitFeedback(args: ToolArgs, ctx: ToolContext): ToolResult {
  const feedback = args['feedback'];
  if (typeof feedback !== 'object' || feedback === null || Array.isArray(feedback)) {
    return fail('feedback object required');
  }
  return ok({ ok: true, ...saveFeedback(ctx.lamDir, feedback) });
}

function getSnapshot(args: ToolArgs, ctx: ToolContext): ToolResult {
  const requestId = rawStr(args, 'requestId');
  const latest = readLatestSnapshot(ctx.lamDir);
  const pending = readPendingSnapshotRequest(ctx.lamDir);
  if (requestId !== '' && latest?.requestId !== requestId) {
    return ok({ ok: true, status: 'pending', pendingRequest: pending, snapshot: null });
  }
  return ok({ ok: true, status: latest === null ? 'none' : 'ready', pendingRequest: pending, snapshot: latest });
}

/** Инструменты карты, feedback и визуализатора. */
const MAP_TOOLS: readonly Tool[] = [
  {
    name: 'list_map_pages',
    description: 'Список pages из liveappmap / enterprise JSON файла карты',
    inputSchema: { type: 'object', required: ['mapPath'], properties: { mapPath: mapPathProp } },
    handler: (args) => {
      const map = loadMap(rawStr(args, 'mapPath'));
      return ok({ ok: true, name: map.name, baseUrl: map.baseUrl, pages: map.pages });
    },
  },
  {
    name: 'get_page',
    description: 'Детали page по id из карты',
    inputSchema: {
      type: 'object',
      required: ['mapPath', 'pageId'],
      properties: { mapPath: mapPathProp, pageId: { type: 'string' } },
    },
    handler: getPage,
  },
  {
    name: 'submit_feedback',
    description: 'Сохранить feedback v1 (note + page) в .lam-feedback/ и вернуть пути артефактов',
    inputSchema: {
      type: 'object',
      required: ['feedback'],
      properties: { feedback: { type: 'object', description: 'live-app-map-feedback v1 object' } },
    },
    handler: submitFeedback,
  },
  {
    name: 'list_feedback',
    description: 'Список сохранённых feedback JSON в .lam-feedback/',
    inputSchema: { type: 'object', properties: {} },
    handler: (_args, ctx) => ok({ ok: true, files: listFeedback(ctx.lamDir) }),
  },
  {
    name: 'get_visualizer_state',
    description:
      'Что сейчас открыто в визуализаторе: карта, выбранный экран, live URL, роль',
    inputSchema: { type: 'object', properties: {} },
    handler: (_args, ctx) => {
      const state = readVisualizerState(ctx.lamDir);
      return state === null
        ? fail('визуализатор ещё не публиковал состояние: откройте http://localhost:4310 (bun run dev)')
        : ok({ ok: true, state });
    },
  },
  {
    name: 'request_snapshot',
    description:
      'Попросить пользователя снять экран визуализатора; результат — get_snapshot',
    inputSchema: {
      type: 'object',
      properties: { note: stringProp('Что нужно увидеть') },
    },
    handler: (args, ctx) => {
      const request = writeSnapshotRequest(ctx.lamDir, optionalStr(args, 'note'));
      return ok({ ok: true, request, hint: 'Пользователь выделит область в визуализаторе; затем get_snapshot' });
    },
  },
  {
    name: 'get_snapshot',
    description: 'Последний снимок экрана (путь к PNG) и статус просьбы',
    inputSchema: {
      type: 'object',
      properties: { requestId: stringProp('id из request_snapshot') },
    },
    handler: getSnapshot,
  },
];

const ALL_TOOLS: readonly Tool[] = [...MAP_TOOLS, ...COMMENT_TOOLS, ...CODE_TOOLS, ...DOCS_TOOLS];

/** Каталог tools. */
export const TOOLS: readonly ToolDef[] = toolCatalog(ALL_TOOLS);

const HANDLERS: ReadonlyMap<string, ToolHandler> = new Map(ALL_TOOLS.map((tool) => [tool.name, tool.handler]));

/**
 * Выполняет tool; ошибки возвращаются как isError, не бросаются.
 *
 * @param name - имя tool
 * @param args - аргументы
 * @param ctx - окружение
 */
export function callTool(name: string, args: ToolArgs, ctx: ToolContext): ToolResult {
  const handler = HANDLERS.get(name);
  if (handler === undefined) {
    return fail(`unknown tool: ${name}`);
  }
  try {
    return handler(args, ctx);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
