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

/**
 * Извлекает path-литералы из исходника route-конфига.
 * Поддерживает: path: "feed", path: "/vacancies", path: 'deals/:id'
 */
export function extractPathsFromSource(source: string): string[] {
  const paths: string[] = [];
  const re = /\bpath\s*:\s*["'`]([^"'`]+)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const p = m[1];
    if (!p || p === '*' || p.includes('${')) {
      continue;
    }
    paths.push(p);
  }
  // tabRoute("id", "path") / similar helpers: second string literal
  const tabRe =
    /\b(?:tabRoute|route|childRoute)\(\s*["'`][^"'`]+["'`]\s*,\s*["'`]([^"'`]+)["'`]/g;
  while ((m = tabRe.exec(source)) !== null) {
    const p = m[1];
    if (p && p !== '*' && !p.includes('${')) {
      paths.push(p);
    }
  }
  // index routes → treat parent later; also Navigate to=
  const navRe = /\bto=["'`]([^"'`]+)["'`]/g;
  while ((m = navRe.exec(source)) !== null) {
    const p = m[1];
    if (p && p.startsWith('/')) {
      paths.push(p);
    }
  }
  // Korbor admin: def("id", "/section", "relative/path", index)
  const defRe =
    /\bdef\(\s*["'`][^"'`]+["'`]\s*,\s*["'`]([^"'`]+)["'`]\s*,\s*["'`]([^"'`]+)["'`]/g;
  while ((m = defRe.exec(source)) !== null) {
    const section = m[1];
    const relPath = m[2];
    if (section && section !== '*') {
      paths.push(section);
    }
    if (relPath && relPath !== '*') {
      paths.push(relPath.startsWith('/') ? relPath : `/${relPath}`);
    }
  }
  return [...new Set(paths)];
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
