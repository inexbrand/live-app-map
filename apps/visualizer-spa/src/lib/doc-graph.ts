/**
 * Граф документации в духе Obsidian: узлы — эпохи, их файлы, заметки, руководства
 * и объекты карты, на которые ссылается текст (роуты, таблицы, экраны, сервисы, файлы кода);
 * рёбра — «эпоха содержит файл», «документ ссылается», «роут/таблица живёт в сервисе».
 * Чистые функции: построение, свёртка эпох, фильтры, соседи, локальный граф, поиск.
 */
import { matchDocTarget, resolveDocRef, type DocRefIndex, type DocTarget } from '@live-app-map/graph';
import type { AppMapDocument, DocFile, EpochReadiness } from '@live-app-map/schema';
import { epochFileLabel, resolveDocAsset } from './docs-view-model';

/** Тип узла графа. */
export type GraphNodeKind = 'epoch' | 'epoch-file' | 'note' | 'guide' | 'route' | 'table' | 'screen' | 'service' | 'file';

/** Узел графа. */
export type GraphNode = {
  readonly id: string;
  readonly kind: GraphNodeKind;
  /** Короткая подпись на графе. */
  readonly label: string;
  /** Полное имя для подсказки и поиска (путь, цель эпохи). */
  readonly detail: string;
  /** Готовность эпохи (у файла эпохи — готовность его эпохи). */
  readonly readiness?: EpochReadiness;
  /** Документ, который открывается по узлу. */
  readonly docPath?: string;
  /** Эпоха узла (для эпохи и её файлов). */
  readonly epochId?: string;
  /** Объект карты, куда ведёт узел. */
  readonly target?: DocTarget;
};

/** Вид ребра. */
export type GraphEdgeKind = 'contains' | 'links' | 'belongs';

/** Ребро графа (без направления при отрисовке). */
export type GraphEdge = { readonly source: string; readonly target: string; readonly kind: GraphEdgeKind };

/** Граф. */
export type DocGraph = { readonly nodes: readonly GraphNode[]; readonly edges: readonly GraphEdge[] };

/** Подписи типов узлов для фильтров и легенды. */
export const NODE_KIND_LABELS: ReadonlyMap<GraphNodeKind, string> = new Map([
  ['epoch', 'Эпохи'],
  ['epoch-file', 'Файлы эпох'],
  ['note', 'Заметки'],
  ['guide', 'Руководства'],
  ['route', 'Роуты'],
  ['table', 'Таблицы'],
  ['screen', 'Экраны'],
  ['service', 'Сервисы'],
  ['file', 'Файлы кода'],
]);

/** Тип узла в единственном числе — для карточки узла. */
export const NODE_KIND_SINGULAR: ReadonlyMap<GraphNodeKind, string> = new Map([
  ['epoch', 'Эпоха'],
  ['epoch-file', 'Файл эпохи'],
  ['note', 'Заметка'],
  ['guide', 'Руководство'],
  ['route', 'Роут'],
  ['table', 'Таблица'],
  ['screen', 'Экран'],
  ['service', 'Сервис'],
  ['file', 'Файл кода'],
]);

/** Путь к файлу кода в `коде`, который карта не знает: `apps/api/src/x.ts:12`. */
const CODE_PATH = /^([\w@.-]+(?:\/[\w@.#[\]()-]+)+\.[a-z]{1,5})(?::\d+)?$/i;

/** Ссылки документа: однострочные `код` и href ссылок. */
export function docReferences(text: string): { readonly codes: readonly string[]; readonly hrefs: readonly string[] } {
  const withoutFences = text.replace(/```[\s\S]*?```/g, '');
  const codes = [...withoutFences.matchAll(/`([^`\n]+)`/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1].trim()]));
  const hrefs = [...withoutFences.matchAll(/(?<!!)\[[^\]]*\]\(<?([^)\s>]+)>?\)/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]));
  return { codes, hrefs };
}

/** Id узла по цели карты. */
function targetId(t: DocTarget): string {
  return matchDocTarget(t, {
    route: (r) => `route:${r.routeId}`,
    table: (r) => `table:${r.table}`,
    screen: (r) => `screen:${r.nodeId}`,
    file: (r) => `file:${r.file}`,
  });
}

function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

/** Строитель графа: узлы по id без повторов, рёбра без повторов и петель. */
export class GraphBuilder {
  readonly nodes = new Map<string, GraphNode>();
  private readonly edgeKeys = new Set<string>();
  readonly edges: GraphEdge[] = [];

  node(n: GraphNode): void {
    if (!this.nodes.has(n.id)) {
      this.nodes.set(n.id, n);
    }
  }

  edge(source: string, target: string, kind: GraphEdgeKind): void {
    if (source === target) {
      return;
    }
    const key = source < target ? `${source}|${target}` : `${target}|${source}`;
    if (this.edgeKeys.has(key)) {
      return;
    }
    this.edgeKeys.add(key);
    this.edges.push({ source, target, kind });
  }
}

/** Узел сервиса и связь «принадлежит» от объекта к нему. */
function linkService(b: GraphBuilder, id: string, svc: { readonly id: string; readonly name: string; readonly root: string } | undefined): void {
  if (svc !== undefined) {
    b.node({ id: `service:${svc.id}`, kind: 'service', label: svc.name, detail: svc.root });
    b.edge(id, `service:${svc.id}`, 'belongs');
  }
}

type RouteTarget = Extract<DocTarget, { kind: 'route' }>;
type TableTarget = Extract<DocTarget, { kind: 'table' }>;

/** Сервис кода по id. */
function serviceOf(doc: AppMapDocument, serviceId: string | undefined): { readonly id: string; readonly name: string; readonly root: string } | undefined {
  return serviceId === undefined ? undefined : doc.code?.services.find((s) => s.id === serviceId);
}

function addRoute(b: GraphBuilder, doc: AppMapDocument, id: string, t: RouteTarget): void {
  const r = doc.code?.routes.find((x) => x.id === t.routeId);
  b.node({ id, kind: 'route', label: r === undefined ? t.routeId : `${r.method} ${r.path}`, detail: r?.location.file ?? '', target: t });
  linkService(b, id, serviceOf(doc, r?.serviceId));
}

function addTable(b: GraphBuilder, doc: AppMapDocument, id: string, t: TableTarget): void {
  const tb = doc.code?.tables.find((x) => x.exportName === t.table);
  b.node({ id, kind: 'table', label: tb?.name ?? t.table, detail: tb?.location.file ?? '', target: t });
  linkService(b, id, serviceOf(doc, tb?.serviceId));
}

/** Узел объекта карты по цели (роут, таблица, экран, файл) и его сервис. */
function addTarget(b: GraphBuilder, doc: AppMapDocument, t: DocTarget): string {
  const id = targetId(t);
  matchDocTarget(t, {
    route: (rt) => addRoute(b, doc, id, rt),
    table: (tt) => addTable(b, doc, id, tt),
    screen: (st) => {
      const n = doc.nodes.find((x) => x.id === st.nodeId);
      b.node({ id, kind: 'screen', label: n?.title ?? st.nodeId, detail: n?.pathPattern ?? '', target: st });
    },
    file: (ft) => b.node({ id, kind: 'file', label: basename(ft.file), detail: ft.file, target: { kind: 'file', file: ft.file } }),
  });
  return id;
}

/** Рёбра одного документа ко всему, на что он ссылается. */
function linkDocument(b: GraphBuilder, doc: AppMapDocument, refs: DocRefIndex, docIds: ReadonlyMap<string, string>, file: DocFile): void {
  const from = `doc:${file.path}`;
  const { codes, hrefs } = docReferences(file.text);
  for (const c of codes) {
    linkCode(b, doc, refs, docIds, file, from, c);
  }
  for (const h of hrefs.filter((x) => !/^[a-z]+:/i.test(x) && !x.startsWith('#'))) {
    linkHref(b, doc, refs, docIds, from, resolveDocAsset(file.path, h));
  }
}

/** `код` в тексте: объект карты, иначе файл кода (не docs/) и/или другой документ. */
function linkCode(b: GraphBuilder, doc: AppMapDocument, refs: DocRefIndex, docIds: ReadonlyMap<string, string>, file: DocFile, from: string, c: string): void {
  const t = resolveDocRef(c, refs);
  if (t !== undefined) {
    b.edge(from, addTarget(b, doc, t), 'links');
    return;
  }
  const m = CODE_PATH.exec(c);
  if (m?.[1] !== undefined && !m[1].startsWith('docs/')) {
    b.edge(from, addTarget(b, doc, { kind: 'file', file: m[1] }), 'links');
  }
  const asDoc = docIds.get(c) ?? docIds.get(resolveDocAsset(file.path, c) ?? '');
  if (asDoc !== undefined) {
    b.edge(from, asDoc, 'links');
  }
}

/** Ссылка markdown на локальный путь: документ, иначе объект карты. */
function linkHref(b: GraphBuilder, doc: AppMapDocument, refs: DocRefIndex, docIds: ReadonlyMap<string, string>, from: string, local: string | null): void {
  if (local === null) {
    return;
  }
  const asDoc = docIds.get(local);
  const t = asDoc === undefined ? resolveDocRef(local, refs) : undefined;
  if (asDoc !== undefined) {
    b.edge(from, asDoc, 'links');
  } else if (t !== undefined) {
    b.edge(from, addTarget(b, doc, t), 'links');
  }
}

/**
 * Полный граф документации карты (все эпохи раскрыты).
 *
 * @param doc - карта с разделом docs
 * @param refs - индекс разбора ссылок (`buildDocRefIndex`)
 * @returns граф; без docs — пустой
 */
export function buildDocGraph(doc: AppMapDocument, refs: DocRefIndex): DocGraph {
  const docs = doc.docs;
  const b = new GraphBuilder();
  if (docs === undefined) {
    return { nodes: [], edges: [] };
  }
  const docIds = new Map<string, string>();
  for (const e of docs.epochs) {
    const eid = `epoch:${e.id}`;
    b.node({ id: eid, kind: 'epoch', label: e.slug, detail: e.summary ?? e.id, readiness: e.readiness, docPath: e.dir, epochId: e.id });
    for (const f of e.files) {
      const id = `doc:${f.path}`;
      docIds.set(f.path, id);
      b.node({ id, kind: 'epoch-file', label: epochFileLabel(e.dir, f.path), detail: f.path, readiness: e.readiness, docPath: f.path, epochId: e.id });
      b.edge(eid, id, 'contains');
    }
  }
  const sections: ReadonlyArray<readonly [GraphNodeKind, readonly DocFile[]]> = [
    ['note', docs.notes],
    ['guide', docs.guides],
  ];
  for (const [kind, files] of sections) {
    for (const f of files) {
      const id = `doc:${f.path}`;
      docIds.set(f.path, id);
      b.node({ id, kind, label: f.title, detail: f.path, docPath: f.path });
    }
  }
  const all = [...docs.epochs.flatMap((e) => e.files), ...docs.notes, ...docs.guides];
  for (const f of all) {
    linkDocument(b, doc, refs, docIds, f);
  }
  return { nodes: [...b.nodes.values()], edges: b.edges };
}

/**
 * Узел графа для документа: файл эпохи, заметка, руководство; каталог эпохи — эпоха.
 *
 * @param docPath - путь документа или каталога эпохи
 * @param epochDir - каталог эпохи документа, если он из эпохи
 * @param epochId - id эпохи
 * @returns id узла
 */
export function docNodeId(docPath: string, epochDir?: string, epochId?: string): string {
  return epochDir !== undefined && epochId !== undefined && docPath === epochDir ? `epoch:${epochId}` : `doc:${docPath}`;
}
