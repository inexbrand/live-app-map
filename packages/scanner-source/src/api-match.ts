/**
 * Путь вызова API из частей и сопоставление с роутами бэкенда.
 */
import type { ApiRoute, HttpMethod } from '@live-app-map/schema';
import type { Part } from './api-value';

/** Метка неизвестного сегмента в строке пути. */
const DYN = '\u0001';
/** Метка параметра обёртки в строке пути. */
const PARAM = '\u0002';

/** Имя параметра, через который обёртка принимает путь целиком. */
const PATH_LIKE = /^(path|url|uri|href|endpoint|route|resource|input|pathname|target)$|(Path|Url|Uri)$/;

/** Файлы, а не API: статика и ассеты. */
const ASSET = /\.(js|mjs|css|png|jpe?g|svg|webp|gif|ico|json|txt|woff2?|map|html|xml|webmanifest)$/i;

/** Абсолютный URL на чужой хост — внешний API, не наш роут. */
const EXTERNAL = /^[a-z][\w+.-]*:\/\/(?!localhost\b|127\.0\.0\.1\b|0\.0\.0\.0\b)/i;

/** Строка пути с метками и имена меток по порядку. */
type Marked = { readonly text: string; readonly names: readonly string[] };

/** Часть — литерал, начинающийся с '/'. */
function startsWithSlash(p: Part | undefined): boolean {
  return p?.kind === 'lit' && p.text.startsWith('/');
}

/**
 * Склеивает части в строку с метками; undefined — путь задаёт не этот код.
 */
function mark(parts: readonly Part[]): Marked | undefined {
  let text = '';
  const names: string[] = [];
  for (const [i, p] of parts.entries()) {
    const step = markStep(p, i === 0, text === '', parts[i + 1]);
    if (step === undefined) {
      return undefined;
    }
    text += step.add;
    names.push(...step.names);
  }
  return { text, names };
}

type MarkStep = { readonly add: string; readonly names: readonly string[] };

/**
 * Неизвестное начало перед литералом '/…' — это origin (`${origin}/api/…`,
 * window.location.origin): пропускается; иначе путь не задан.
 */
function originStep(next: Part | undefined): MarkStep | undefined {
  return startsWithSlash(next) ? { add: '', names: [] } : undefined;
}

/** Вклад части в размеченный текст: литерал, база env, параметр (PARAM), прочее (DYN). */
function markStep(p: Part, first: boolean, empty: boolean, next: Part | undefined): MarkStep | undefined {
  if (p.kind === 'lit') {
    return { add: p.text, names: [] };
  }
  if (p.kind === 'env' && first) {
    return { add: p.base ?? '', names: [] };
  }
  if (p.kind === 'param' && PATH_LIKE.test(p.name)) {
    return undefined;
  }
  if (empty) {
    return originStep(next);
  }
  return { add: p.kind === 'param' ? PARAM : DYN, names: [p.name] };
}

/** Имя сегмента-параметра без лишних символов. */
function paramName(name: string): string {
  return `:${name.replace(/[^\w$]/g, '') || 'param'}`;
}

/**
 * Путь вызова: без origin, query и hash; неизвестные сегменты — `:имя`.
 *
 * @param parts - части URL
 * @returns путь или undefined, если это не вызов нашего API (обёртка, ассет, внешний хост, относительный путь)
 */
export function normalizeApiPath(parts: readonly Part[]): string | undefined {
  const marked = mark(parts);
  if (marked === undefined || EXTERNAL.test(marked.text)) {
    return undefined;
  }
  const s = pathOnly(marked.text);
  const out = s.startsWith('/') ? pathSegments(s, marked.names) : undefined;
  if (out === undefined || ASSET.test(out[out.length - 1] ?? '')) {
    return undefined;
  }
  return `/${out.join('/')}`;
}

/** Путь без схемы и хоста, без query и hash; '//' — в '/' (база и путь склеены через '/'). */
function pathOnly(text: string): string {
  const s = text.replace(/^[a-z][\w+.-]*:\/\/[^/]*/i, '').replace(/\/{2,}/g, '/');
  const cut = s.search(/[?#]/);
  return cut >= 0 ? s.slice(0, cut) : s;
}

/** Сегменты пути с именами параметров; параметр-адрес внутри сегмента — undefined. */
function pathSegments(s: string, names: readonly string[]): string[] | undefined {
  let nameIndex = 0;
  const segs = s.split('/').filter((x) => x !== '');
  const out: string[] = [];
  for (const [i, seg] of segs.entries()) {
    const marks = [...seg].filter((ch) => ch === DYN || ch === PARAM).length;
    const next = segmentOut(seg, marks, i === segs.length - 1, names[nameIndex] ?? 'param');
    nameIndex += marks;
    if (next === undefined) {
      return undefined;
    }
    out.push(next);
  }
  return out;
}

/** Сегмент результата: литерал, параметр, хвост-литерал перед query-подстановкой; PARAM внутри — undefined. */
function segmentOut(seg: string, marks: number, isLast: boolean, name: string): string | undefined {
  if (marks === 0) {
    return seg;
  }
  if (seg.includes(PARAM) && seg !== PARAM) {
    return undefined;
  }
  // `entity${buildQuery()}` — хвост без '/', это query.
  return isLast && seg !== PARAM && !seg.startsWith(DYN) ? seg.slice(0, seg.indexOf(DYN)) : paramName(name);
}

/** Сегмент — параметр: `:id`, `:id?`, `{id}`. */
function isParamSeg(seg: string): boolean {
  return seg.startsWith(':') || (seg.startsWith('{') && seg.endsWith('}'));
}

/**
 * Насколько путь вызова совпадает с путём роута: литерал = литерал — 3,
 * параметр = параметр — 2, литерал вызова в параметр роута — 1.
 *
 * @returns очки или undefined, если не совпадает
 */
function score(call: readonly string[], route: readonly string[]): number | undefined {
  const wildcard = route[route.length - 1] === '*';
  const fixed = wildcard ? route.slice(0, -1) : route;
  if (wildcard ? call.length < fixed.length : call.length !== fixed.length) {
    return undefined;
  }
  let total = 0;
  for (const [i, r] of fixed.entries()) {
    const c = call[i] ?? '';
    if (isParamSeg(r)) {
      total += isParamSeg(c) ? 2 : 1;
    } else if (r === c) {
      total += 3;
    } else {
      return undefined;
    }
  }
  return total;
}

/**
 * Лучший роут для вызова: метод совпадает (или роут на любой метод), путь — по сегментам.
 *
 * @param method - метод вызова
 * @param callPath - нормализованный путь вызова
 * @param routes - роуты
 * @returns роут или undefined
 */
export function matchRoute(method: HttpMethod, callPath: string, routes: readonly ApiRoute[]): ApiRoute | undefined {
  const call = callPath.split('/').filter((x) => x !== '');
  let best: { route: ApiRoute; score: number } | undefined;
  for (const route of routes) {
    if (route.method !== method && route.method !== 'ALL') {
      continue;
    }
    const s = score(call, route.path.split('/').filter((x) => x !== ''));
    if (s !== undefined && (best === undefined || s > best.score)) {
      best = { route, score: s };
    }
  }
  return best?.route;
}
