/**
 * MCP tools документации проекта: эпохи задач, их файлы и поиск по тексту.
 * Читают раздел `docs` карты (собирается `scan --code-dir` / `code`).
 */
import { epochList, findEpoch, searchDocs } from '@live-app-map/graph';
import type { DocEpoch, EpochReadiness } from '@live-app-map/schema';
import { loadDocs } from './map-tools';
import type { ToolDef, ToolResult } from './tools';

/** Аргументы tool. */
type Args = Readonly<Record<string, unknown>>;

const mapPathProp = {
  type: 'string',
  description: 'Путь к карте с разделом docs, например maps/live-app-map.liveappmap.json',
};

const READINESS: readonly EpochReadiness[] = ['ready', 'not-ready', 'no-bugs-file'];

/** Каталог tools документации. */
export const DOCS_TOOLS: readonly ToolDef[] = [
  {
    name: 'list_epochs',
    description:
      'Эпохи задач проекта (docs/epoch/<задача>#<дата>): дата, цель, статус из INDEX.md, готовность (ready — открытых пунктов в 09-bugs нет, not-ready — есть) и открытые пункты',
    inputSchema: {
      type: 'object',
      required: ['mapPath'],
      properties: {
        mapPath: mapPathProp,
        query: { type: 'string', description: 'Подстрока имени, цели или открытого пункта' },
        readiness: { type: 'string', enum: READINESS, description: 'Только эпохи с этой готовностью' },
      },
    },
  },
  {
    name: 'get_epoch',
    description: 'Эпоха целиком: файлы 00-brief … 09-bugs, INDEX и прочие (markdown), картинки; или один файл эпохи',
    inputSchema: {
      type: 'object',
      required: ['mapPath', 'epoch'],
      properties: {
        mapPath: mapPathProp,
        epoch: { type: 'string', description: 'Имя папки (slug#дата) или slug — тогда самая новая' },
        file: { type: 'string', description: 'Имя файла эпохи, например 09-bugs.md; без него — все файлы' },
      },
    },
  },
  {
    name: 'search_docs',
    description: 'Поиск подстроки по всей документации: эпохи, docs/agent-notes, CLAUDE.md/README, docs/*.md. Отдаёт файл, строку и текст строки',
    inputSchema: {
      type: 'object',
      required: ['mapPath', 'query'],
      properties: {
        mapPath: mapPathProp,
        query: { type: 'string', description: 'Подстрока без учёта регистра' },
        limit: { type: 'number', description: 'Предел попаданий, по умолчанию 50' },
      },
    },
  },
];

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

/** Карта из обязательного mapPath. */
function docsOf(args: Args): ReturnType<typeof loadDocs> {
  const mapPath = str(args, 'mapPath');
  if (mapPath === '') {
    throw new Error('mapPath обязателен: путь к карте с разделом docs, например maps/live-app-map.liveappmap.json');
  }
  return loadDocs(mapPath);
}

/** Эпоха одной строкой для списка. */
function epochLine(e: DocEpoch): Record<string, unknown> {
  return {
    id: e.id,
    ...(e.date === undefined ? {} : { date: e.date }),
    ...(e.summary === undefined ? {} : { summary: e.summary }),
    ...(e.declaredStatus === undefined ? {} : { status: e.declaredStatus }),
    readiness: e.readiness,
    openBugs: e.openBugs,
    files: e.files.length,
    images: e.images.length,
  };
}

function listEpochs(args: Args): ToolResult {
  const docs = docsOf(args);
  const readiness = str(args, 'readiness');
  const r = READINESS.find((x) => x === readiness);
  if (readiness !== '' && r === undefined) {
    return fail(`readiness: одно из ${READINESS.join(', ')}`);
  }
  const epochs = epochList(docs, { query: str(args, 'query'), ...(r === undefined ? {} : { readiness: r }) });
  return ok({ ok: true, total: epochs.length, epochs: epochs.map(epochLine) });
}

function getEpoch(args: Args): ToolResult {
  const docs = docsOf(args);
  const ref = str(args, 'epoch');
  if (ref === '') {
    return fail('epoch обязателен: имя папки эпохи (slug#дата) или slug');
  }
  const e = findEpoch(docs, ref);
  if (e === undefined) {
    const near = docs.epochs.filter((x) => x.id.includes(ref.split('#')[0] ?? ref)).map((x) => x.id).slice(0, 10);
    return fail(`эпоха не найдена: ${ref}. Похожие: ${near.join(', ') || 'нет'}`);
  }
  const fileName = str(args, 'file');
  const files = fileName === '' ? e.files : e.files.filter((f) => f.path.endsWith(`/${fileName}`));
  if (fileName !== '' && files.length === 0) {
    return fail(`в эпохе ${e.id} нет файла ${fileName}. Есть: ${e.files.map((f) => f.path.slice(e.dir.length + 1)).join(', ')}`);
  }
  return ok({ ok: true, ...epochLine(e), dir: e.dir, imagePaths: e.images, files });
}

function searchDocsTool(args: Args): ToolResult {
  const docs = docsOf(args);
  const query = str(args, 'query');
  if (query === '') {
    return fail('query обязателен: подстрока для поиска');
  }
  const limit = typeof args['limit'] === 'number' && args['limit'] > 0 ? args['limit'] : 50;
  const hits = searchDocs(docs, query, limit);
  return ok({ ok: true, total: hits.length, hits });
}

/** Обработчики tools документации. */
export const DOCS_HANDLERS: ReadonlyMap<string, (args: Args) => ToolResult> = new Map([
  ['list_epochs', listEpochs],
  ['get_epoch', getEpoch],
  ['search_docs', searchDocsTool],
]);
