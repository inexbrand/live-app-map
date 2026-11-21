/**
 * Граф документации в духе Obsidian: узлы — эпохи, их файлы, заметки, руководства
 * и объекты карты, на которые ссылается текст (роуты, таблицы, экраны, сервисы, файлы кода);
 * рёбра — «эпоха содержит файл», «документ ссылается», «роут/таблица живёт в сервисе».
 * Чистые функции: построение, свёртка эпох, фильтры, соседи, локальный граф, поиск.
 */
import { resolveDocRef, type DocRefIndex, type DocTarget } from '@live-app-map/graph';
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
  switch (t.kind) {
    case 'route':
      return `route:${t.routeId}`;
    case 'table':
      return `table:${t.table}`;
    case 'screen':
      return `screen:${t.nodeId}`;
    case 'file':
      return `file:${t.file}`;
  }
}

function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

/** Строитель графа: узлы по id без повторов, рёбра без повторов и петель. */
class GraphBuilder {
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

/** Узел объекта карты по цели (роут, таблица, экран, файл) и его сервис. */
function addTarget(b: GraphBuilder, doc: AppMapDocument, t: DocTarget): string {
  const id = targetId(t);
  const code = doc.code;
  switch (t.kind) {
    case 'route': {
      const r = code?.routes.find((x) => x.id === t.routeId);
      b.node({ id, kind: 'route', label: r === undefined ? t.routeId : `${r.method} ${r.path}`, detail: r?.location.file ?? '', target: t });
      const svc = r === undefined ? undefined : code?.services.find((s) => s.id === r.serviceId);
      if (svc !== undefined) {
        b.node({ id: `service:${svc.id}`, kind: 'service', label: svc.name, detail: svc.root });
        b.edge(id, `service:${svc.id}`, 'belongs');
      }
      return id;
    }
    case 'table': {
      const tb = code?.tables.find((x) => x.exportName === t.table);
      b.node({ id, kind: 'table', label: tb?.name ?? t.table, detail: tb?.location.file ?? '', target: t });
      const svc = tb === undefined ? undefined : code?.services.find((s) => s.id === tb.serviceId);
      if (svc !== undefined) {
        b.node({ id: `service:${svc.id}`, kind: 'service', label: svc.name, detail: svc.root });
        b.edge(id, `service:${svc.id}`, 'belongs');
      }
      return id;
    }
    case 'screen': {
      const n = doc.nodes.find((x) => x.id === t.nodeId);
      b.node({ id, kind: 'screen', label: n?.title ?? t.nodeId, detail: n?.pathPattern ?? '', target: t });
      return id;
    }
    case 'file':
      b.node({ id, kind: 'file', label: basename(t.file), detail: t.file, target: { kind: 'file', file: t.file } });
      return id;
  }
}

/** Рёбра одного документа ко всему, на что он ссылается. */
function linkDocument(b: GraphBuilder, doc: AppMapDocument, refs: DocRefIndex, docIds: ReadonlyMap<string, string>, file: DocFile): void {
  const from = `doc:${file.path}`;
  const { codes, hrefs } = docReferences(file.text);
  for (const c of codes) {
    const t = resolveDocRef(c, refs);
    if (t !== undefined) {
      b.edge(from, addTarget(b, doc, t), 'links');
      continue;
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
  for (const h of hrefs) {
    if (/^[a-z]+:/i.test(h) || h.startsWith('#')) {
      continue;
    }
    const local = resolveDocAsset(file.path, h);
    const asDoc = local === null ? undefined : docIds.get(local);
    if (asDoc !== undefined) {
      b.edge(from, asDoc, 'links');
      continue;
    }
    const t = local === null ? undefined : resolveDocRef(local, refs);
    if (t !== undefined) {
      b.edge(from, addTarget(b, doc, t), 'links');
    }
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
 * Свёртка: файлы нераскрытых эпох убираются, их ссылки переходят на эпоху.
 *
 * @param g - полный граф
 * @param expanded - id раскрытых эпох (`DocEpoch.id`)
 * @returns граф с эпохами-узлами
 */
export function collapseEpochs(g: DocGraph, expanded: ReadonlySet<string>): DocGraph {
  const owner = new Map<string, string>();
  for (const n of g.nodes) {
    if (n.kind === 'epoch-file' && n.epochId !== undefined && !expanded.has(n.epochId)) {
      owner.set(n.id, `epoch:${n.epochId}`);
    }
  }
  const b = new GraphBuilder();
  g.nodes.filter((n) => !owner.has(n.id)).forEach((n) => b.node(n));
  for (const e of g.edges) {
    b.edge(owner.get(e.source) ?? e.source, owner.get(e.target) ?? e.target, e.kind);
  }
  return { nodes: [...b.nodes.values()], edges: b.edges };
}

/** Фильтр графа. */
export type GraphFilter = {
  /** Видимые типы; пусто — все. */
  readonly kinds?: ReadonlySet<GraphNodeKind>;
  /** Готовность эпох; null — любая. */
  readonly readiness?: EpochReadiness | null;
};

/** Узел документа (не объект карты). */
function isDocKind(k: GraphNodeKind): boolean {
  return k === 'epoch' || k === 'epoch-file' || k === 'note' || k === 'guide';
}

/**
 * Фильтр по типу и готовности. Готовность выбирает документы-опоры; объект карты
 * остаётся, если на него ссылается опора (даже когда сами документы скрыты типом —
 * «только файлы кода» показывает файлы, упомянутые в документах). Сервисы — если
 * видим их роут или таблица.
 *
 * @param g - граф
 * @param f - фильтр
 * @returns отфильтрованный граф
 */
export function filterGraph(g: DocGraph, f: GraphFilter): DocGraph {
  const kinds = f.kinds === undefined || f.kinds.size === 0 ? null : f.kinds;
  const readiness = f.readiness ?? null;
  const anchors = new Set(
    g.nodes
      .filter((n) => isDocKind(n.kind) && (readiness === null || n.kind === 'note' || n.kind === 'guide' || n.readiness === readiness))
      .map((n) => n.id),
  );
  const linked = new Set<string>();
  for (const e of g.edges) {
    if (anchors.has(e.source)) {
      linked.add(e.target);
    }
    if (anchors.has(e.target)) {
      linked.add(e.source);
    }
  }
  const visible = new Set<string>(
    g.nodes.filter((n) => anchors.has(n.id) && (kinds === null || kinds.has(n.kind))).map((n) => n.id),
  );
  for (const n of g.nodes) {
    if (!isDocKind(n.kind) && n.kind !== 'service' && linked.has(n.id) && (kinds === null || kinds.has(n.kind))) {
      visible.add(n.id);
    }
  }
  for (const e of g.edges) {
    if (e.kind === 'belongs' && visible.has(e.source) && (kinds === null || kinds.has('service'))) {
      visible.add(e.target);
    }
  }
  return {
    nodes: g.nodes.filter((n) => visible.has(n.id)),
    edges: g.edges.filter((e) => visible.has(e.source) && visible.has(e.target)),
  };
}

/**
 * Соседи узла.
 *
 * @param g - граф
 * @param id - узел
 * @returns id соседей (без самого узла)
 */
export function graphNeighbors(g: DocGraph, id: string): Set<string> {
  const out = new Set<string>();
  for (const e of g.edges) {
    if (e.source === id) {
      out.add(e.target);
    } else if (e.target === id) {
      out.add(e.source);
    }
  }
  return out;
}

/**
 * Локальный граф: узел и всё в пределах depth шагов (как local graph в Obsidian).
 *
 * @param g - граф
 * @param id - центр
 * @param depth - глубина (1–3)
 * @returns подграф; центра нет в графе — пустой
 */
export function localGraph(g: DocGraph, id: string, depth: number): DocGraph {
  if (!g.nodes.some((n) => n.id === id)) {
    return { nodes: [], edges: [] };
  }
  const adj = new Map<string, string[]>();
  for (const e of g.edges) {
    adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
    adj.set(e.target, [...(adj.get(e.target) ?? []), e.source]);
  }
  const seen = new Set([id]);
  let frontier = [id];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const x of frontier) {
      for (const y of adj.get(x) ?? []) {
        if (!seen.has(y)) {
          seen.add(y);
          next.push(y);
        }
      }
    }
    frontier = next;
  }
  return { nodes: g.nodes.filter((n) => seen.has(n.id)), edges: g.edges.filter((e) => seen.has(e.source) && seen.has(e.target)) };
}

/**
 * Узлы, у которых подпись или полное имя содержат все слова запроса.
 *
 * @param g - граф
 * @param query - запрос
 * @returns id найденных; пустой запрос — пусто
 */
export function searchGraph(g: DocGraph, query: string): Set<string> {
  const words = query.trim().toLowerCase().split(/\s+/).filter((w) => w !== '');
  if (words.length === 0) {
    return new Set();
  }
  return new Set(g.nodes.filter((n) => words.every((w) => `${n.label}\n${n.detail}`.toLowerCase().includes(w))).map((n) => n.id));
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
