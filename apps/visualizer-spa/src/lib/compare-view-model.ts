/**
 * Модель вида «Сравнение»: разница двух версий карты (graph.diffDocuments)
 * разделами «Экраны», «Роуты», «Таблицы», «Связи», «Прочие узлы» с подписями
 * по-человечески и переходом к сущности, если она есть во версии «стало».
 */
import { diffChangeCount, diffDocuments, type ChangedFields, type DocTarget } from '@live-app-map/graph';
import type { AppMapDocument, AppMapNode } from '@live-app-map/schema';

/** Что случилось с сущностью. */
export type CompareChange = 'added' | 'removed' | 'changed';

/** Строка раздела. */
export type CompareItem = {
  readonly id: string;
  readonly change: CompareChange;
  readonly label: string;
  /** Что изменилось или вид связи. */
  readonly detail?: string;
  /** Куда перейти в открытой карте; нет — сущности нет во «стало». */
  readonly target?: DocTarget;
};

/** Раздел сравнения. */
export type CompareSection = {
  readonly key: 'screens' | 'routes' | 'tables' | 'edges' | 'nodes';
  readonly title: string;
  readonly items: readonly CompareItem[];
};

/** Итог сравнения. */
export type MapComparison = {
  readonly total: number;
  readonly sections: readonly CompareSection[];
};

/** Поле → слово. */
const FIELD_WORDS: ReadonlyMap<string, string> = new Map([
  ['pathPattern', 'путь'],
  ['url', 'адрес'],
  ['title', 'название'],
  ['kind', 'вид'],
  ['method', 'метод'],
  ['path', 'путь'],
  ['serviceId', 'сервис'],
  ['input', 'вход'],
  ['access', 'доступ'],
  ['response', 'ответ'],
  ['dbCalls', 'запросы БД'],
  ['doc', 'описание'],
]);

const ORDER: Readonly<Record<CompareChange, number>> = { added: 0, removed: 1, changed: 2 };

/** Изменённые поля словами. */
function fieldWords(c: ChangedFields): string {
  return c.fields.map((f) => FIELD_WORDS.get(f) ?? f).join(', ');
}

/** Строки раздела из списков id: добавленные и изменённые берутся из «стало», пропавшие — из «было». */
function rows<T>(
  ids: { readonly added: readonly string[]; readonly removed: readonly string[]; readonly changed: readonly { readonly id: string; readonly detail: string }[] },
  find: (side: 'left' | 'right', id: string) => T | undefined,
  describe: (x: T, side: 'left' | 'right') => { readonly label: string; readonly target?: DocTarget; readonly detail?: string },
): CompareItem[] {
  const item = (id: string, change: CompareChange, detail?: string): CompareItem[] => {
    const side = change === 'removed' ? 'left' : 'right';
    const x = find(side, id);
    if (x === undefined) {
      return [];
    }
    const d = describe(x, side);
    const shownDetail = detail ?? d.detail;
    return [
      {
        id,
        change,
        label: d.label,
        ...(shownDetail === undefined || shownDetail === '' ? {} : { detail: shownDetail }),
        ...(side === 'right' && d.target !== undefined ? { target: d.target } : {}),
      },
    ];
  };
  return [
    ...ids.added.flatMap((id) => item(id, 'added')),
    ...ids.removed.flatMap((id) => item(id, 'removed')),
    ...ids.changed.flatMap((c) => item(c.id, 'changed', c.detail)),
  ].sort((a, b) => ORDER[a.change] - ORDER[b.change] || a.label.localeCompare(b.label));
}

/** Подпись ноды: название и путь. */
function nodeLabel(n: AppMapNode): string {
  return n.pathPattern === '' ? n.title : `${n.title} · ${n.pathPattern}`;
}

/** Разделы нод: экраны и прочие узлы. */
function nodeSections(left: AppMapDocument, right: AppMapDocument, d: ReturnType<typeof diffDocuments>): CompareSection[] {
  const nodes = { left: new Map(left.nodes.map((n) => [n.id, n])), right: new Map(right.nodes.map((n) => [n.id, n])) };
  const kindOf = (id: string): string | undefined => (nodes.right.get(id) ?? nodes.left.get(id))?.kind;
  const pick = (page: boolean) => {
    const keep = (id: string): boolean => (kindOf(id) === 'page') === page;
    return {
      added: d.nodes.added.filter(keep),
      removed: d.nodes.removed.filter(keep),
      changed: d.nodes.changed.filter((c) => keep(c.id)).map((c) => ({ id: c.id, detail: fieldWords(c) })),
    };
  };
  const find = (side: 'left' | 'right', id: string): AppMapNode | undefined => nodes[side].get(id);
  const describe = (n: AppMapNode): { label: string; target?: DocTarget } => {
    const target: DocTarget = { kind: 'screen', nodeId: n.id };
    return { label: nodeLabel(n), ...(n.kind === 'page' ? { target } : {}) };
  };
  return [
    { key: 'screens', title: 'Экраны', items: rows(pick(true), find, describe) },
    { key: 'nodes', title: 'Прочие узлы', items: rows(pick(false), find, describe) },
  ];
}

/** Обе версии карты. */
type Sides = { readonly left: AppMapDocument; readonly right: AppMapDocument };

type Diff = ReturnType<typeof diffDocuments>;

/** Индекс сущностей версии по id. */
function indexBy<T extends { readonly id: string }>(docs: Sides, pick: (d: AppMapDocument) => readonly T[]): Readonly<Record<'left' | 'right', ReadonlyMap<string, T>>> {
  return { left: new Map(pick(docs.left).map((x) => [x.id, x])), right: new Map(pick(docs.right).map((x) => [x.id, x])) };
}

/** Название ноды версии (нет ноды — id, нет конца — прочерк). */
function nodeTitle(doc: AppMapDocument, id: string | null): string {
  return id === null ? '—' : (doc.nodes.find((n) => n.id === id)?.title ?? id);
}

function routeSection(docs: Sides, d: Diff): CompareSection {
  const byId = indexBy(docs, (x) => x.code?.routes ?? []);
  return {
    key: 'routes',
    title: 'Роуты',
    items: rows(
      { ...d.routes, changed: d.routes.changed.map((c) => ({ id: c.id, detail: fieldWords(c) })) },
      (side, id) => byId[side].get(id),
      (r) => ({ label: `${r.method} ${r.path}`, target: { kind: 'route', routeId: r.id } }),
    ),
  };
}

/** Изменённые колонки таблицы: `+новая · −старая · ~другая`. */
function columnWords(c: Diff['tables']['changed'][number]): string {
  return [...c.columns.added.map((x) => `+${x}`), ...c.columns.removed.map((x) => `−${x}`), ...c.columns.changed.map((x) => `~${x}`)].join(' · ');
}

function tableSection(docs: Sides, d: Diff): CompareSection {
  const byId = indexBy(docs, (x) => x.code?.tables ?? []);
  return {
    key: 'tables',
    title: 'Таблицы',
    items: rows(
      { ...d.tables, changed: d.tables.changed.map((c) => ({ id: c.id, detail: columnWords(c) })) },
      (side, id) => byId[side].get(id),
      (t) => ({ label: t.name, target: { kind: 'table', table: t.exportName } }),
    ),
  };
}

function edgeSection(docs: Sides, d: Diff): CompareSection {
  const byId = indexBy(docs, (x) => x.edges);
  return {
    key: 'edges',
    title: 'Связи',
    items: rows(
      { ...d.edges, changed: [] },
      (side, id) => {
        const e = byId[side].get(id);
        return e === undefined ? undefined : { e, side };
      },
      ({ e, side }) => ({ label: `${nodeTitle(docs[side], e.from)} → ${nodeTitle(docs[side], e.to)}`, detail: e.kind }),
    ),
  };
}

/**
 * Сравнение двух версий карты.
 *
 * @param left - было
 * @param right - стало
 * @returns число изменений и разделы
 */
export function compareMaps(left: AppMapDocument, right: AppMapDocument): MapComparison {
  const d = diffDocuments(left, right);
  const docs = { left, right };
  const [screens, nodes] = nodeSections(left, right, d);
  const sections: CompareSection[] = [
    ...(screens === undefined ? [] : [screens]),
    routeSection(docs, d),
    tableSection(docs, d),
    edgeSection(docs, d),
    ...(nodes === undefined ? [] : [nodes]),
  ];
  return { total: diffChangeCount(d), sections };
}
