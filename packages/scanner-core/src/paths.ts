/**
 * Шаблоны путей: подстановка примеров параметров, имена параметров, человекочитаемый заголовок.
 */
import path from 'node:path';
import { getExampleParam, type ExampleParamsConfig } from './example-params';

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

  // optional catch-all [[...param]] — empty/undefined → no segment
  result = result.replace(/\[\[\.\.\.([^\]]+)\]\]/g, (_m, name: string) => {
    const v = getExampleParam(exampleParams, name, byRoute);
    if (v === undefined) {
      return '';
    }
    if (Array.isArray(v)) {
      return v.length ? v.join('/') : '';
    }
    return String(v);
  });

  // catch-all [...param]
  result = result.replace(/\[\.\.\.([^\]]+)\]/g, (_m, name: string) => {
    const v = getExampleParam(exampleParams, name, byRoute);
    if (v === undefined) {
      missing.push(name);
      return 'example';
    }
    if (Array.isArray(v)) {
      return v.join('/');
    }
    return String(v);
  });

  // dynamic [param]
  result = result.replace(/\[([^\].]+)\]/g, (_m, name: string) => {
    const v = getExampleParam(exampleParams, name, byRoute);
    if (v === undefined) {
      missing.push(name);
      return 'example';
    }
    if (Array.isArray(v)) {
      return v[0] ?? 'example';
    }
    return String(v);
  });

  // collapse double slashes and trailing
  result = result.replace(/\/{2,}/g, '/');
  if (result.length > 1 && result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  if (result === '') {
    result = '/';
  }
  return { path: result, missing };
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
