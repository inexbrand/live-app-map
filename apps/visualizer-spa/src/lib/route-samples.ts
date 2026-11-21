/**
 * Реальные значения параметров маршрута экрана (`/vacancies/[id]`) из API
 * приложения: экран уже вызывает роут сущности (`GET …/vacancies/:vacancyId`),
 * список той же сущности — тот же путь без последнего параметра. Первый id
 * списка под профилем экрана открывает экран с данными вместо «demo».
 */
import type { AppMapDocument, AppMapNode } from '@live-app-map/schema';

/** Параметр экрана и списки API, где искать его значение (по порядку). */
export type ParamSource = { readonly param: string; readonly lists: readonly string[] };

/** Путь списка API: только статические сегменты. */
const LIST_PATH = /^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/;

/** Параметр сегмента экрана `[id]`; catch-all `[...x]` не подставляется. */
function paramOf(segment: string): string | null {
  const m = /^\[([A-Za-z_][A-Za-z0-9_]*)\]$/.exec(segment);
  return m?.[1] ?? null;
}

/**
 * Шаблон пути экрана: карта во viewer-формате хранит его в metadata.pathPattern
 * (pathPattern ноды после конвертации — пример пути).
 *
 * @param node - экран
 */
export function screenPattern(node: AppMapNode): string {
  const meta = node.metadata?.['pathPattern'];
  return typeof meta === 'string' && meta !== '' ? meta : node.pathPattern;
}

/**
 * Проверяет путь списка: статический путь API, без схемы, параметров и «..».
 *
 * @param path - путь
 */
export function isListPath(path: string): boolean {
  return LIST_PATH.test(path) && !path.split('/').includes('..');
}

/**
 * Пути GET-роутов API, которые вызывает экран (рёбра kind=api, metadata.routeIds
 * вида `api:<сервис> GET /api/v1/…`).
 *
 * @param doc - карта
 * @param nodeId - экран
 */
export function screenApiGets(doc: AppMapDocument, nodeId: string): string[] {
  const out = new Set<string>();
  for (const e of doc.edges) {
    const ids = e.kind === 'api' && e.from === nodeId ? e.metadata?.['routeIds'] : undefined;
    if (!Array.isArray(ids)) {
      continue;
    }
    for (const id of ids) {
      const m = typeof id === 'string' ? /\sGET\s(\/\S+)$/.exec(id) : null;
      if (m?.[1] !== undefined) {
        out.add(m[1]);
      }
    }
  }
  return [...out];
}

/**
 * Откуда брать значения параметров экрана: для `/vacancies/[id]` — списки
 * `…/vacancies` из роутов `GET …/vacancies/:x` и `GET …/vacancies`, которые
 * экран вызывает.
 *
 * @param pathPattern - шаблон пути экрана
 * @param apiGets - пути GET-роутов экрана
 * @returns параметры, для которых нашёлся хоть один список
 */
export function paramSources(pathPattern: string, apiGets: readonly string[]): ParamSource[] {
  const segments = pathPattern.split('/');
  const out: ParamSource[] = [];
  segments.forEach((segment, i) => {
    const param = paramOf(segment);
    const prev = segments[i - 1];
    if (param === null || prev === undefined || prev === '' || paramOf(prev) !== null) {
      return;
    }
    const lists = new Set<string>();
    for (const path of apiGets) {
      const parts = path.split('/');
      const last = parts[parts.length - 1] ?? '';
      const list = last.startsWith(':') ? parts.slice(0, -1).join('/') : path;
      if (list.endsWith(`/${prev}`) && isListPath(list)) {
        lists.add(list);
      }
    }
    if (lists.size > 0) {
      out.push({ param, lists: [...lists].sort() });
    }
  });
  return out;
}

/**
 * Источники параметров экрана: сначала роуты, которые экран вызывает; для
 * параметров без них — все GET-роуты из раздела code карты (у экранов, чьи
 * вызовы сканер не сопоставил, например админка korbor). Чужой список
 * под профилем экрана ответит 401/403 и пропустится.
 *
 * @param doc - карта
 * @param node - экран
 */
export function nodeParamSources(doc: AppMapDocument, node: AppMapNode): ParamSource[] {
  const pattern = screenPattern(node);
  if (node.kind === 'service' || !pattern.includes('[')) {
    return [];
  }
  const own = paramSources(pattern, screenApiGets(doc, node.id));
  const all = paramSources(pattern, (doc.code?.routes ?? []).filter((r) => r.method === 'GET').map((r) => r.path));
  return all
    .map((s) => own.find((o) => o.param === s.param) ?? s)
    .concat(own.filter((o) => !all.some((s) => s.param === o.param)));
}

/**
 * Списки API, нужные экрану (пусто — у экрана нет параметров или списков).
 *
 * @param doc - карта
 * @param node - экран
 */
export function nodeSampleLists(doc: AppMapDocument, node: AppMapNode): string[] {
  return [...new Set(nodeParamSources(doc, node).flatMap((s) => s.lists))];
}

/**
 * Путь экрана с реальными значениями параметров.
 *
 * @param doc - карта
 * @param node - экран
 * @param samples - список API → первый id под профилем экрана (null — список пуст или закрыт)
 * @returns путь или null — значение нашлось не для всех параметров
 */
export function sampledPath(doc: AppMapDocument, node: AppMapNode, samples: ReadonlyMap<string, string | null> | undefined): string | null {
  const pattern = screenPattern(node);
  if (samples === undefined || node.kind === 'service' || !pattern.includes('[')) {
    return null;
  }
  const sources = nodeParamSources(doc, node);
  const values = new Map<string, string>();
  for (const s of sources) {
    const value = s.lists.map((l) => samples.get(l)).find((v) => typeof v === 'string' && v !== '');
    if (typeof value === 'string') {
      values.set(s.param, value);
    }
  }
  const segments = pattern.split('/').map((seg) => {
    const p = paramOf(seg);
    return p === null ? seg : values.get(p) === undefined ? null : encodeURIComponent(values.get(p) ?? '');
  });
  return segments.every((s) => s !== null) ? segments.join('/') : null;
}

/**
 * id первой записи ответа списка: `{items:[…]}`, `{data:{items:[…]}}`,
 * `{data:[…]}` или массив.
 *
 * @param body - JSON ответа
 */
export function firstId(body: unknown): string | null {
  const pick = (v: unknown): object | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v : null);
  const listOf = (v: unknown): unknown[] | null => {
    if (Array.isArray(v)) {
      return v;
    }
    const o = pick(v);
    if (o === null) {
      return null;
    }
    for (const key of ['items', 'data', 'results', 'rows']) {
      const inner = Reflect.get(o, key);
      const list = Array.isArray(inner) ? inner : key === 'data' ? listOf(inner) : null;
      if (list !== null) {
        return list;
      }
    }
    return null;
  };
  for (const item of listOf(body) ?? []) {
    const o = pick(item);
    const id = o === null ? undefined : Reflect.get(o, 'id');
    if ((typeof id === 'string' && id !== '') || typeof id === 'number') {
      return String(id);
    }
  }
  return null;
}

/**
 * Адрес с другим путём (query и hash сохраняются).
 *
 * @param url - адрес экрана
 * @param pathname - путь с реальными параметрами
 */
export function withPathname(url: string, pathname: string): string {
  const u = new URL(url);
  u.pathname = pathname;
  return u.href;
}
