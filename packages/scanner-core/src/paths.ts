/**
 * Шаблоны путей: подстановка примеров параметров, имена параметров, человекочитаемый заголовок.
 */
import { getExampleParam, type ExampleParamsConfig } from './example-params';

/** Необязательный catch-all: нет значения или пустой массив — сегмента нет. */
function optionalSegment(v: string | readonly string[] | undefined): string {
  if (v === undefined) {
    return '';
  }
  return Array.isArray(v) ? v.join('/') : String(v);
}

/** Двойные слэши — в один, хвостовой слэш убрать, пустой путь — «/». */
function tidyPath(p: string): string {
  const collapsed = p.replace(/\/{2,}/g, '/');
  const trimmed = collapsed.length > 1 && collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed;
  return trimmed === '' ? '/' : trimmed;
}

/**
 * Подставляет example-params в path pattern (dynamic / catch-all / optional catch-all).
 */
export function materializePath(
  pattern: string,
  exampleParams: ExampleParamsConfig = {},
): { path: string; missing: string[] } {
  const byRoute = exampleParams.byRoute?.[pattern];
  const missing: string[] = [];
  let result = pattern;

  const param = (name: string) => getExampleParam(exampleParams, name, byRoute);
  /** Нет значения: обязательный параметр — «example» и в missing. */
  const required = (name: string, join: (v: readonly string[]) => string): string => {
    const v = param(name);
    if (v === undefined) {
      missing.push(name);
      return 'example';
    }
    return Array.isArray(v) ? join(v) : String(v);
  };
  // optional catch-all [[...param]] — empty/undefined → no segment
  result = result.replace(/\[\[\.\.\.([^\]]+)\]\]/g, (_m, name: string) => optionalSegment(param(name)));
  // catch-all [...param]
  result = result.replace(/\[\.\.\.([^\]]+)\]/g, (_m, name: string) => required(name, (v) => v.join('/')));
  // dynamic [param]
  result = result.replace(/\[([^\].]+)\]/g, (_m, name: string) => required(name, (v) => v[0] ?? 'example'));
  return { path: tidyPath(result), missing };
}

/**
 * Извлекает имена dynamic-параметров из path pattern.
 */
export function extractDynamicParams(pattern: string): string[] {
  const names: string[] = [];
  const re = /\[(?:\.\.\.)?([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pattern)) !== null) {
    const name = m[1];
    if (name) {
      names.push(name.replace(/^\.\.\./, ''));
    }
  }
  return names;
}

/**
 * Человекочитаемый заголовок маршрута для UI карты (общий для next / react-router).
 *
 * @param pattern pathPattern вида `/`, `/users/[id]`, `/shop/[...slug]`
 * @returns «Главная» для корня, иначе сегменты через ` / ` без скобок dynamic
 */
export function humanTitle(pattern: string): string {
  if (pattern === '/' || pattern === '') {
    return 'Главная';
  }
  return pattern
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      const stripped = seg.replace(/^\[+\.?\.?\.?/, '').replace(/\]+$/, '');
      return stripped || seg;
    })
    .join(' / ');
}