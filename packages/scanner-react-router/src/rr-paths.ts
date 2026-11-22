/**
 * Пути React Router: литералы path из исходника, нормализация вложенных, шаблон с параметрами.
 */

export const DEFAULT_ENTRY_GLOBS = [
  'src/app/routes-config.tsx',
  'src/app/routes-config.ts',
  'src/app/router.tsx',
  'src/app/router.ts',
  'src/features/shell/route-config.ts',
  'src/features/shell/route-config.tsx',
  'src/features/shell/router.ts',
  'src/features/shell/router.tsx',
  'src/router.tsx',
  'src/router.ts',
  'src/routes.tsx',
  'src/routes.ts',
];

/** Не пустой и не «*». */
function isConcrete(p: string | undefined): p is string {
  return p !== undefined && p !== '' && p !== '*';
}

/** Литерал пути без подстановок шаблона. */
function isLiteralPath(p: string | undefined): p is string {
  return isConcrete(p) && !p.includes('${');
}

/** Источники путей по порядку: регулярка и пути из совпадения. */
const PATH_SOURCES: readonly [RegExp, (m: RegExpMatchArray) => string[]][] = [
  // path: "feed", path: "/vacancies", path: 'deals/:id'
  [/\bpath\s*:\s*["'`]([^"'`]+)["'`]/g, (m) => (isLiteralPath(m[1]) ? [m[1]] : [])],
  // tabRoute("id", "path") / similar helpers: second string literal
  [/\b(?:tabRoute|route|childRoute)\(\s*["'`][^"'`]+["'`]\s*,\s*["'`]([^"'`]+)["'`]/g, (m) => (isLiteralPath(m[1]) ? [m[1]] : [])],
  // Navigate to=
  [/\bto=["'`]([^"'`]+)["'`]/g, (m) => (m[1]?.startsWith('/') ? [m[1]] : [])],
  // Korbor admin: def("id", "/section", "relative/path", index)
  [
    /\bdef\(\s*["'`][^"'`]+["'`]\s*,\s*["'`]([^"'`]+)["'`]\s*,\s*["'`]([^"'`]+)["'`]/g,
    (m) => [...(isConcrete(m[1]) ? [m[1]] : []), ...(isConcrete(m[2]) ? [m[2].startsWith('/') ? m[2] : `/${m[2]}`] : [])],
  ],
];

/**
 * Извлекает path-литералы из исходника route-конфига.
 * Поддерживает: path: "feed", path: "/vacancies", path: 'deals/:id'
 */
export function extractPathsFromSource(source: string): string[] {
  return [...new Set(PATH_SOURCES.flatMap(([re, pathsOf]) => [...source.matchAll(re)].flatMap(pathsOf)))];
}

/**
 * Нормализует RR path segments в absolute pattern.
 */
export function normalizeRrPath(raw: string, parent = '/'): string {
  if (raw.startsWith('/')) {
    return raw === '' ? '/' : raw.replace(/\/+/g, '/');
  }
  if (parent === '/') {
    return `/${raw}`.replace(/\/+/g, '/');
  }
  return `${parent.replace(/\/$/, '')}/${raw}`.replace(/\/+/g, '/');
}

/**
 * RR :param → [param] для единого pathPattern.
 */
export function rrToPattern(pathStr: string): string {
  return pathStr
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':') && seg.endsWith('?')) {
        return `[${seg.slice(1, -1)}]`;
      }
      if (seg.startsWith(':')) {
        return `[${seg.slice(1)}]`;
      }
      if (seg.startsWith('*')) {
        return `[...${seg.slice(1) || 'rest'}]`;
      }
      return seg;
    })
    .join('/');
}