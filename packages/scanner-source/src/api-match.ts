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

/**
 * Склеивает части в строку с метками; undefined — путь задаёт не этот код.
 */
function mark(parts: readonly Part[]): Marked | undefined {
  let text = '';
  const names: string[] = [];
  for (const [i, p] of parts.entries()) {
    if (p.kind === 'lit') {
      text += p.text;
    } else if (p.kind === 'env' && i === 0) {
      text += p.base ?? '';
    } else if (p.kind === 'param') {
      if (i === 0 || PATH_LIKE.test(p.name)) {
        return undefined;
      }
      text += PARAM;
      names.push(p.name);
    } else if (i === 0) {
      // Неизвестное начало перед литералом '/…' — это origin (window.location.origin и т. п.).
      const nextPart = parts[1];
      if (nextPart?.kind !== 'lit' || !nextPart.text.startsWith('/')) {
        return undefined;
      }
    } else {
      text += DYN;
      names.push(p.name);
    }
  }
  return { text, names };
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
  // База и путь склеиваются через '/', поэтому '//' внутри — не protocol-relative URL.
  let s = marked.text.replace(/^[a-z][\w+.-]*:\/\/[^/]*/i, '').replace(/\/{2,}/g, '/');
  const cut = s.search(/[?#]/);
  if (cut >= 0) {
    s = s.slice(0, cut);
  }
  if (!s.startsWith('/')) {
    return undefined;
  }
  let nameIndex = 0;
  const segs = s.split('/').filter((x) => x !== '');
  const out: string[] = [];
  for (const [i, seg] of segs.entries()) {
    const marks = [...seg].filter((ch) => ch === DYN || ch === PARAM).length;
    const name = marked.names[nameIndex] ?? 'param';
    nameIndex += marks;
    if (marks === 0) {
      out.push(seg);
    } else if (seg === DYN || seg === PARAM) {
      out.push(paramName(name));
    } else if (seg.includes(PARAM)) {
      return undefined;
    } else if (i === segs.length - 1 && !seg.startsWith(DYN)) {
      // `entity${buildQuery()}` — хвост без '/', это query.
      out.push(seg.slice(0, seg.indexOf(DYN)));
    } else {
      out.push(paramName(name));
    }
  }
  if (ASSET.test(out[out.length - 1] ?? '')) {
    return undefined;
  }
  return `/${out.join('/')}`;
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
