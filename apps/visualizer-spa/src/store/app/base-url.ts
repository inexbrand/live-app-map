/**
 * Базовый URL карты: переписать URL экранов, проверить введённый base.
 */
import type { AppMapDocument, Diagnostic } from '@live-app-map/schema';

/** Результат переписывания node.url относительно baseUrl. */
type WithBaseUrlResult = {
  readonly document: AppMapDocument;
  readonly error: string | null;
};

type WithBaseUrlOptions = {
  /**
   * true — переписать все page URL с path+base (явный override пользователя).
   * false — сохранить абсолютные http(s) URL нод (multi-surface korbor-all).
   */
  readonly forceRewrite?: boolean;
};

/**
 * Число различных http(s) host:port среди absolute page/not-found URL.
 * ≥2 → multi-surface карта (korbor-all): forceRewrite нельзя — схлопнет хосты.
 *
 * @param doc - документ до rewrite
 * @returns число уникальных host:port
 */
export function countAbsolutePageHosts(doc: AppMapDocument): number {
  const hosts = new Set<string>();
  for (const n of doc.nodes) {
    if (n.kind !== 'page' && n.kind !== 'not-found') {
      continue;
    }
    if (!n.url) {
      continue;
    }
    try {
      const existing = new URL(n.url);
      if (existing.protocol === 'http:' || existing.protocol === 'https:') {
        hosts.add(existing.host);
      }
    } catch {
      // malformed url — ignore for host inventory
    }
  }
  return hosts.size;
}

/**
 * URL экранов относительно base.
 *
 * @param doc - документ карты
 * @param baseUrl - новый base (override или document.baseUrl)
 * @param options - forceRewrite
 */
export function withBaseUrl(
  doc: AppMapDocument,
  baseUrl: string,
  options: WithBaseUrlOptions = {},
): WithBaseUrlResult {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return { document: doc, error: null };
  }
  const base = parseHttpBase(trimmed);
  if (typeof base === 'string') {
    return { document: doc, error: base };
  }
  const forceRewrite = options.forceRewrite === true;
  const nodes = doc.nodes.map((n) => (n.kind !== 'page' && n.kind !== 'not-found') || keepsOwnUrl(n, forceRewrite) ? n : withNodeUrl(n, base));
  return { document: { ...doc, baseUrl: trimmed, nodes }, error: null };
}

/** Base как URL http(s); иначе текст ошибки. */
function parseHttpBase(trimmed: string): URL | string {
  let base: URL;
  try {
    base = new URL(trimmed);
  } catch {
    return `Некорректный Base URL: «${trimmed}»`;
  }
  return base.protocol !== 'http:' && base.protocol !== 'https:' ? `Base URL: только http/https («${trimmed}»)` : base;
}

/** Multi-surface maps: keep absolute live URLs unless user forced base override. */
function keepsOwnUrl(n: AppMapDocument['nodes'][number], forceRewrite: boolean): boolean {
  if (forceRewrite || !n.url) {
    return false;
  }
  try {
    const existing = new URL(n.url);
    return existing.protocol === 'http:' || existing.protocol === 'https:';
  } catch {
    // fall through — materialize from path
    return false;
  }
}

/** URL ноды из её пути на base; путь не собирается — нода как есть. */
function withNodeUrl<N extends AppMapDocument['nodes'][number]>(n: N, base: URL): N {
  const path = n.pathExample ?? n.pathPattern;
  try {
    return { ...n, url: new URL(path.startsWith('/') ? path : `/${path}`, base).href };
  } catch {
    return n;
  }
}

/** Ошибка введённого base без открытой карты: сообщение для toast и диагностика. */
export type BaseUrlIssue = { readonly message: string; readonly diagnostic: Diagnostic };

function issue(message: string): BaseUrlIssue {
  return { message, diagnostic: { code: 'INVALID_BASE_URL', severity: 'error', message, path: 'baseUrl' } };
}

/**
 * Проверка введённого base, когда карты нет; null — пусто или корректный http(s).
 *
 * @param trimmed - base без пробелов по краям, не пустой
 */
export function checkBaseUrl(trimmed: string): BaseUrlIssue | null {
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return issue(`Base URL: только http/https («${trimmed}»)`);
    }
    return null;
  } catch {
    return issue(`Некорректный Base URL: «${trimmed}»`);
  }
}
