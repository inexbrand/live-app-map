/**
 * Глобальный поиск по карте: экраны, роуты, таблицы, эпохи, документы и файлы кода
 * одним списком. Чистые функции: индекс строится раз на карту, запрос — подстроки слов.
 */
import { shortSummary } from '@live-app-map/graph';
import type { AppMapDocument } from '@live-app-map/schema';
import { epochFileLabel, readinessLabel } from './docs-view-model';

/** Тип результата. */
export type SearchKind = 'screen' | 'route' | 'table' | 'epoch' | 'doc' | 'file';

/** Куда ведёт результат. */
export type SearchTarget =
  | { readonly kind: 'screen'; readonly nodeId: string }
  | { readonly kind: 'route'; readonly routeId: string }
  | { readonly kind: 'table'; readonly table: string }
  | { readonly kind: 'doc'; readonly path: string }
  /** Файл кода: роуты файла в виде «API», иначе таблица или экран файла. */
  | { readonly kind: 'file'; readonly file: string };

/** Строка результата. */
export type SearchItem = {
  readonly id: string;
  readonly kind: SearchKind;
  readonly title: string;
  readonly detail: string;
  readonly target: SearchTarget;
  /** Текст для сравнения (нижний регистр). */
  readonly text: string;
};

/** Подписи групп результатов в порядке показа. */
export const SEARCH_KIND_LABELS: ReadonlyMap<SearchKind, string> = new Map([
  ['screen', 'Экраны'],
  ['route', 'Роуты'],
  ['table', 'Таблицы'],
  ['epoch', 'Эпохи'],
  ['doc', 'Документы'],
  ['file', 'Файлы'],
]);

const KIND_ORDER = [...SEARCH_KIND_LABELS.keys()];

function item(kind: SearchKind, id: string, title: string, detail: string, target: SearchTarget): SearchItem {
  return { id: `${kind}:${id}`, kind, title, detail, target, text: `${title}\n${detail}`.toLowerCase() };
}

/**
 * Индекс поиска по карте.
 *
 * @param doc - карта
 * @returns строки поиска
 */
export function buildSearchIndex(doc: AppMapDocument): SearchItem[] {
  const out: SearchItem[] = [];
  for (const n of doc.nodes) {
    if (n.kind === 'service') {
      continue;
    }
    out.push(item('screen', n.id, n.title, n.pathPattern, { kind: 'screen', nodeId: n.id }));
  }
  const code = doc.code;
  const files = new Set<string>();
  for (const r of code?.routes ?? []) {
    out.push(item('route', r.id, `${r.method} ${r.path}`, shortSummary(r.doc, r.comments) ?? r.location.file, { kind: 'route', routeId: r.id }));
    files.add(r.location.file);
  }
  for (const t of code?.tables ?? []) {
    out.push(item('table', t.exportName, t.name, t.exportName === t.name ? t.location.file : `${t.exportName} · ${t.location.file}`, { kind: 'table', table: t.exportName }));
    files.add(t.location.file);
  }
  for (const s of code?.symbols ?? []) {
    files.add(s.location.file);
  }
  for (const e of doc.docs?.epochs ?? []) {
    out.push(item('epoch', e.id, e.slug, `${readinessLabel(e)}${e.summary === undefined ? '' : ` · ${e.summary}`}`, { kind: 'doc', path: e.dir }));
    for (const f of e.files) {
      out.push(item('doc', f.path, `${e.slug} · ${epochFileLabel(e.dir, f.path)}`, f.title, { kind: 'doc', path: f.path }));
    }
  }
  for (const f of [...(doc.docs?.notes ?? []), ...(doc.docs?.guides ?? [])]) {
    out.push(item('doc', f.path, f.title, f.path, { kind: 'doc', path: f.path }));
  }
  for (const f of [...files].sort()) {
    out.push(item('file', f, f.split('/').pop() ?? f, f, { kind: 'file', file: f }));
  }
  return out;
}

/** Очки совпадения: начало названия > слово в названии > подстрока названия > подробности. */
function score(it: SearchItem, q: string, words: readonly string[]): number {
  const title = it.title.toLowerCase();
  let s = 0;
  if (title === q) {
    s += 1000;
  } else if (title.startsWith(q)) {
    s += 400;
  } else if (title.includes(q)) {
    s += 200;
  }
  for (const w of words) {
    if (title.includes(w)) {
      s += 20;
    }
  }
  return s - title.length / 100;
}

/**
 * Поиск: все слова запроса должны встретиться в названии или подробностях.
 *
 * @param index - индекс
 * @param query - запрос
 * @param perKind - предел строк в группе
 * @returns результаты, сгруппированные по типу в порядке показа
 */
export function searchIndex(index: readonly SearchItem[], query: string, perKind = 6): SearchItem[] {
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter((w) => w !== '');
  if (words.length === 0) {
    return [];
  }
  const groups = new Map<SearchKind, { it: SearchItem; s: number }[]>();
  for (const it of index) {
    if (words.every((w) => it.text.includes(w))) {
      const list = groups.get(it.kind) ?? [];
      list.push({ it, s: score(it, q, words) });
      groups.set(it.kind, list);
    }
  }
  // Группа с точным совпадением названия — первой, остальные в порядке KIND_ORDER
  // (экраны, роуты, таблицы, эпохи, документы, файлы).
  const exact = (list: readonly { it: SearchItem }[]): number => (list.some((x) => x.it.title.toLowerCase() === q) ? 0 : 1);
  return [...groups.entries()]
    .map(([kind, list]) => ({ kind, list: list.sort((a, b) => b.s - a.s).slice(0, perKind) }))
    .sort((a, b) => exact(a.list) - exact(b.list) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .flatMap((g) => g.list.map((x) => x.it));
}
