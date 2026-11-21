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
import { CODE_HANDLERS, CODE_TOOLS } from './code-tools';
import { listFeedback, saveFeedback } from './feedback-store';
import { loadMap } from './map-tools';

/** Описание tool для tools/list. */
export type ToolDef = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
};

/** Результат tools/call. */
export type ToolResult = {
  readonly content: ReadonlyArray<{ readonly type: 'text'; readonly text: string }>;
  readonly isError?: boolean;
};

/** Окружение tools. */
export type ToolContext = {
  /** Папка обмена (`resolveLamDir`). */
  readonly lamDir: string;
};

const mapPathProp = { type: 'string', description: 'Путь к .json карте' };

/** Каталог tools. */
export const TOOLS: readonly ToolDef[] = [
  {
    name: 'list_map_pages',
    description: 'Список pages из liveappmap / enterprise JSON файла карты',
    inputSchema: { type: 'object', required: ['mapPath'], properties: { mapPath: mapPathProp } },
  },
  {
    name: 'get_page',
    description: 'Детали page по id из карты',
    inputSchema: {
      type: 'object',
      required: ['mapPath', 'pageId'],
      properties: { mapPath: mapPathProp, pageId: { type: 'string' } },
    },
  },
  {
    name: 'submit_feedback',
    description: 'Сохранить feedback v1 (note + page) в .lam-feedback/ и вернуть пути артефактов',
    inputSchema: {
      type: 'object',
      required: ['feedback'],
      properties: { feedback: { type: 'object', description: 'live-app-map-feedback v1 object' } },
    },
  },
  {
    name: 'list_feedback',
    description: 'Список сохранённых feedback JSON в .lam-feedback/',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_visualizer_state',
    description:
      'Что сейчас открыто в визуализаторе: карта, выбранный экран, live URL, роль',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'request_snapshot',
    description:
      'Попросить пользователя снять экран визуализатора; результат — get_snapshot',
    inputSchema: {
      type: 'object',
      properties: { note: { type: 'string', description: 'Что нужно увидеть' } },
    },
  },
  {
    name: 'get_snapshot',
    description: 'Последний снимок экрана (путь к PNG) и статус просьбы',
    inputSchema: {
      type: 'object',
      properties: { requestId: { type: 'string', description: 'id из request_snapshot' } },
    },
  },
  ...CODE_TOOLS,
];

function ok(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function fail(text: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

function stringArg(args: Readonly<Record<string, unknown>>, key: string): string {
  const v = args[key];
  return typeof v === 'string' ? v : '';
}

function getPage(args: Readonly<Record<string, unknown>>): ToolResult {
  const pageId = stringArg(args, 'pageId');
  const page = loadMap(stringArg(args, 'mapPath')).pages.find((p) => p.id === pageId);
  return page === undefined ? fail(`page not found: ${pageId}`) : ok({ ok: true, page });
}

function submitFeedback(args: Readonly<Record<string, unknown>>, ctx: ToolContext): ToolResult {
  const feedback = args['feedback'];
  if (typeof feedback !== 'object' || feedback === null || Array.isArray(feedback)) {
    return fail('feedback object required');
  }
  return ok({ ok: true, ...saveFeedback(ctx.lamDir, feedback) });
}

function getSnapshot(args: Readonly<Record<string, unknown>>, ctx: ToolContext): ToolResult {
  const requestId = stringArg(args, 'requestId');
  const latest = readLatestSnapshot(ctx.lamDir);
  const pending = readPendingSnapshotRequest(ctx.lamDir);
  if (requestId !== '' && latest?.requestId !== requestId) {
    return ok({ ok: true, status: 'pending', pendingRequest: pending, snapshot: null });
  }
  return ok({ ok: true, status: latest === null ? 'none' : 'ready', pendingRequest: pending, snapshot: latest });
}

type Handler = (args: Readonly<Record<string, unknown>>, ctx: ToolContext) => ToolResult;

const HANDLERS: ReadonlyMap<string, Handler> = new Map<string, Handler>([
  ['list_map_pages', (args) => {
    const map = loadMap(stringArg(args, 'mapPath'));
    return ok({ ok: true, name: map.name, baseUrl: map.baseUrl, pages: map.pages });
  }],
  ['get_page', getPage],
  ['submit_feedback', submitFeedback],
  ['list_feedback', (_args, ctx) => ok({ ok: true, files: listFeedback(ctx.lamDir) })],
  ['get_visualizer_state', (_args, ctx) => {
    const state = readVisualizerState(ctx.lamDir);
    return state === null
      ? fail('визуализатор ещё не публиковал состояние: откройте http://localhost:4310 (bun run dev)')
      : ok({ ok: true, state });
  }],
  ['request_snapshot', (args, ctx) => {
    const note = stringArg(args, 'note').trim();
    const request = writeSnapshotRequest(ctx.lamDir, note === '' ? null : note);
    return ok({ ok: true, request, hint: 'Пользователь выделит область в визуализаторе; затем get_snapshot' });
  }],
  ['get_snapshot', getSnapshot],
  ...CODE_HANDLERS,
]);

/**
 * Выполняет tool; ошибки возвращаются как isError, не бросаются.
 *
 * @param name - имя tool
 * @param args - аргументы
 * @param ctx - окружение
 */
export function callTool(
  name: string,
  args: Readonly<Record<string, unknown>>,
  ctx: ToolContext,
): ToolResult {
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
