/**
 * Вызовы HTTP-клиентов: fetch, axios, ky, Eden treaty, Hono RPC.
 */
import ts from 'typescript';
import type { ApiClientKind, HttpMethod } from '@live-app-map/schema';
import { lastName, partsOf, type Frame, type Part, type Value } from './api-value';
import type { ValueEvaluator } from './value-evaluator';

/** Вызов клиента: библиотека, метод, части URL. */
export type SinkHit = {
  readonly client: ApiClientKind;
  readonly method: HttpMethod;
  readonly url: readonly Part[];
};

const VERBS: ReadonlyMap<string, HttpMethod> = new Map<string, HttpMethod>([
  ['get', 'GET'],
  ['post', 'POST'],
  ['put', 'PUT'],
  ['patch', 'PATCH'],
  ['delete', 'DELETE'],
  ['head', 'HEAD'],
  ['options', 'OPTIONS'],
]);

/** Имя получателя, похожее на HTTP-клиент проекта: `api`, `apiClient`, `http`, `adminApi`. */
const CLIENT_NAME = /(^|[a-z])(api|Api|API|client|Client|http|Http|rest|Rest|fetcher|Fetcher)$/;

/** Имя внедрённого fetch: `fetchWithAuth`, `authedFetch`, `apiFetch`. */
const FETCH_NAME = /(^fetch[A-Z]|Fetch$|^fetch$)/;

/**
 * fetch, пришедший параметром (сессия, DI): `createStore(fetchWithAuth)` →
 * `fetchWithAuth('/x', init)`. Объявленная функция с таким именем — не он.
 */
function injectedFetch(ev: ValueEvaluator, callee: ts.Expression, fn: Value): boolean {
  if (!ts.isIdentifier(callee) || !FETCH_NAME.test(callee.text) || ev.functionsOf(callee) !== undefined) {
    return false;
  }
  return fn.kind === 'str' && fn.parts.length === 1 && fn.parts[0]?.kind === 'param';
}

/** Метод клиента «глагол + уточнение»: `getRaw`, `postForm` → GET, POST. */
function prefixedVerb(name: string): HttpMethod | undefined {
  const m = /^(get|post|put|patch|delete)[A-Z]/.exec(name);
  return m?.[1] === undefined ? undefined : VERBS.get(m[1]);
}

/** Методы, которые могут быть вызовом HTTP: глаголы, `request`, `fetch`, `$get` у Hono, `getRaw`. */
function maySend(name: string): boolean {
  return VERBS.has(name) || name === 'request' || name === 'fetch' || (name.startsWith('$') && VERBS.has(name.slice(1))) || prefixedVerb(name) !== undefined;
}

/** Значение начинается с литерала пути `/…`. */
function startsWithPath(v: Value | undefined): boolean {
  const head = v?.kind === 'str' ? v.parts[0] : undefined;
  return head?.kind === 'lit' && head.text.startsWith('/');
}

/** Аргумент — функция (обработчик роута `app.get('/x', handler)`, а не запрос). */
function isHandlerArg(arg: ts.Expression | undefined): boolean {
  return arg !== undefined && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg));
}

/** Метод из значения: `'post'`, `HttpMethod.Post` → POST; иначе запасной. */
function methodOf(v: Value | undefined, fallback: HttpMethod): HttpMethod {
  if (v?.kind !== 'str' || !v.parts.every((p) => p.kind === 'lit')) {
    return fallback;
  }
  const text = v.parts.map((p) => (p.kind === 'lit' ? p.text : '')).join('');
  return VERBS.get(text.toLowerCase()) ?? fallback;
}

/** Свойство объекта-значения. */
function prop(v: Value | undefined, key: string): Value | undefined {
  return v?.kind === 'obj' ? v.props.get(key) : undefined;
}

/** База + '/' + путь (axios baseURL и ky prefixUrl склеивают через слэш). */
function joined(base: readonly Part[], url: readonly Part[], origin: ts.Node): readonly Part[] {
  return base.length === 0 ? url : [...base, { kind: 'lit', text: '/', origin }, ...url];
}

/** Части URL аргумента. */
function urlParts(v: Value | undefined, origin: ts.Node, arg: ts.Expression | undefined): readonly Part[] {
  return v === undefined ? [] : partsOf(v, origin, lastName(arg?.getText() ?? 'url'));
}

/** Клиент — axios или ky (модуль по умолчанию или созданный экземпляр). */
function libOf(v: Value): { lib: 'axios' | 'ky'; base: readonly Part[] } | undefined {
  if (v.kind === 'module' && (v.module === 'axios' || v.module === 'ky') && v.member === 'default') {
    return { lib: v.module, base: [] };
  }
  if (v.kind === 'client' && (v.lib === 'axios' || v.lib === 'ky')) {
    return { lib: v.lib, base: v.base };
  }
  return undefined;
}

/** Путь цепочки Eden/Hono: база + сегменты. */
function chainUrl(v: Value & { readonly kind: 'client' }, origin: ts.Node): readonly Part[] {
  return [...v.base, ...v.segs.flatMap((s): Part[] => [{ kind: 'lit', text: '/', origin }, s])];
}

/**
 * Вызов HTTP-клиента в этом месте.
 *
 * @param ev - вычислитель
 * @param call - вызов
 * @param frame - значения параметров
 * @param origin - вызов, которому приписываются новые части
 * @returns клиент, метод и URL или undefined
 */
export function sinkAt(ev: ValueEvaluator, call: ts.CallExpression, frame: Frame, origin: ts.Node): SinkHit | undefined {
  const site: CallSite = { ev, call, frame, origin };
  const callee = call.expression;
  if (ts.isPropertyAccessExpression(callee)) {
    return maySend(callee.name.text) ? memberSink(site, callee) : undefined;
  }
  const fn = ev.evaluate(callee, frame, origin);
  if (fn.kind === 'fetch' || injectedFetch(ev, callee, fn)) {
    return fetchSink(site);
  }
  const lib = libOf(fn);
  if (lib === undefined) {
    return undefined;
  }
  const first = argAt(site, 0);
  if (first?.kind === 'obj') {
    return configSink(site, lib, first);
  }
  return { client: lib.lib, method: methodOf(prop(argAt(site, 1), 'method'), 'GET'), url: joined(lib.base, urlParts(first, origin, call.arguments[0]), origin) };
}

/** Вызов и окружение вычисления его аргументов. */
type CallSite = { readonly ev: ValueEvaluator; readonly call: ts.CallExpression; readonly frame: Frame; readonly origin: ts.Node };

/** Значение аргумента i или undefined. */
function argAt(site: CallSite, i: number): Value | undefined {
  const a = site.call.arguments[i];
  return a === undefined ? undefined : site.ev.evaluate(a, site.frame, site.origin);
}

/** `fetch(url, { method })`. */
function fetchSink(site: CallSite): SinkHit {
  return { client: 'fetch', method: methodOf(prop(argAt(site, 1), 'method'), 'GET'), url: urlParts(argAt(site, 0), site.origin, site.call.arguments[0]) };
}

/** `axios({ method, url })`, `client.request({ method, url })`. */
function configSink(site: CallSite, lib: NonNullable<ReturnType<typeof libOf>>, config: Value | undefined): SinkHit {
  return { client: lib.lib, method: methodOf(prop(config, 'method'), 'GET'), url: joined(lib.base, urlParts(prop(config, 'url'), site.origin, undefined), site.origin) };
}

/** Метод цепочки Eden (`.get()`) или Hono RPC (`.$get()`). */
function chainSink(recv: Value, name: string, origin: ts.Node): SinkHit | undefined {
  if (recv.kind !== 'client') {
    return undefined;
  }
  const verb = recv.lib === 'eden' ? VERBS.get(name) : recv.lib === 'hono-rpc' && name.startsWith('$') ? VERBS.get(name.slice(1)) : undefined;
  return verb === undefined ? undefined : { client: recv.lib, method: verb, url: chainUrl(recv, origin) };
}

/** `x.name(...)`: цепочка клиента, window.fetch, метод axios/ky, иначе обёртка проекта. */
function memberSink(site: CallSite, callee: ts.PropertyAccessExpression): SinkHit | undefined {
  const name = callee.name.text;
  const recv = site.ev.evaluate(callee.expression, site.frame, site.origin);
  const chained = chainSink(recv, name, site.origin);
  if (chained !== undefined) {
    return chained;
  }
  if (name === 'fetch' && /^(window|globalThis|self)$/.test(callee.expression.getText())) {
    return fetchSink(site);
  }
  const lib = libOf(recv);
  const verb = VERBS.get(name);
  if (lib !== undefined && verb !== undefined) {
    return { client: lib.lib, method: verb, url: joined(lib.base, urlParts(argAt(site, 0), site.origin, site.call.arguments[0]), site.origin) };
  }
  if (lib !== undefined && name === 'request') {
    return configSink(site, lib, argAt(site, 0));
  }
  return namedClient(site.ev, site.call, callee, site.frame, site.origin);
}

/**
 * Клиент проекта, реализацию которого не разрешить (интерфейс с фабрикой поверх
 * внедрённого fetch): `api.post('/x', body)`, `apiClient.request('/x', { method })`,
 * `client.request({ path, method })`. Путь — литерал этого места.
 */
function namedClient(
  ev: ValueEvaluator,
  call: ts.CallExpression,
  callee: ts.PropertyAccessExpression,
  frame: Frame,
  origin: ts.Node,
): SinkHit | undefined {
  const name = callee.name.text;
  if (!CLIENT_NAME.test(lastName(callee.expression.getText())) || isHandlerArg(call.arguments[1])) {
    return undefined;
  }
  if (ev.functionsOf(callee) !== undefined) {
    return undefined;
  }
  const first = call.arguments[0];
  const value = first === undefined ? undefined : ev.evaluate(first, frame, origin);
  const prefixed = prefixedVerb(name);
  if (prefixed !== undefined) {
    // `api.getUser(id)` — не путь; вызов, только если первый аргумент — путь.
    return startsWithPath(value) ? { client: 'wrapper', method: prefixed, url: urlParts(value, origin, first) } : undefined;
  }
  const verb = VERBS.get(name);
  if (value?.kind === 'obj') {
    return objectWrapperSink(value, verb, origin);
  }
  return { client: 'wrapper', method: verb ?? optionsMethod(ev, call.arguments[1], frame, origin), url: urlParts(value, origin, first) };
}

/** `api.send({ path | url, method })`. */
function objectWrapperSink(value: Value, verb: HttpMethod | undefined, origin: ts.Node): SinkHit {
  const url = prop(value, 'path') ?? prop(value, 'url');
  return { client: 'wrapper', method: methodOf(prop(value, 'method'), verb ?? 'GET'), url: urlParts(url, origin, undefined) };
}

/** Метод из второго аргумента-опций обёртки; нет — GET. */
function optionsMethod(ev: ValueEvaluator, second: ts.Expression | undefined, frame: Frame, origin: ts.Node): HttpMethod {
  const options = second === undefined ? undefined : ev.evaluate(second, frame, origin);
  return methodOf(prop(options, 'method'), 'GET');
}
