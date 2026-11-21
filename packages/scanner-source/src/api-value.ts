/**
 * Значения символьного вычисления аргументов вызова API: строки из частей (литерал,
 * неизвестный сегмент, параметр обёртки, база из env), объекты, клиенты
 * axios/ky/Eden/Hono. Каждая часть строки помнит место вызова, где появилась, —
 * по нему видно, кто задал путь: вызывающий код или сама обёртка.
 */
import ts from 'typescript';

/** Часть строки URL. */
export type Part =
  | { readonly kind: 'lit'; readonly text: string; readonly origin: ts.Node }
  /** Значение неизвестно при скане — становится сегментом `:name`. */
  | { readonly kind: 'dyn'; readonly name: string; readonly origin: ts.Node }
  /** Несвязанный параметр функции: путь задаёт вызывающий — это обёртка. */
  | { readonly kind: 'param'; readonly name: string; readonly origin: ts.Node }
  /** База из env: `base` — путь из env-файла, undefined — переменной нет. */
  | { readonly kind: 'env'; readonly name: string; readonly base: string | undefined; readonly origin: ts.Node };

/** Клиентская библиотека с базой. */
export type ClientLib = 'axios' | 'ky' | 'eden' | 'hono-rpc';

/** Вычисленное значение выражения. */
export type Value =
  | { readonly kind: 'str'; readonly parts: readonly Part[] }
  | { readonly kind: 'obj'; readonly props: ReadonlyMap<string, Value> }
  /** Клиент: база и (для Eden/Hono) уже пройденные сегменты пути. */
  | { readonly kind: 'client'; readonly lib: ClientLib; readonly base: readonly Part[]; readonly segs: readonly Part[] }
  /** Значение из внешнего модуля: `axios`, `ky`, `hc`, `treaty`. */
  | { readonly kind: 'module'; readonly module: string; readonly member: string }
  | { readonly kind: 'fetch' }
  | { readonly kind: 'none' }
  | { readonly kind: 'unknown'; readonly name: string };

/** Функция проекта с телом. */
export type FunctionNode = ts.SignatureDeclaration & { readonly body?: ts.Node };

/** Значения параметров функции при подстановке. */
export type Frame = ReadonlyMap<ts.Symbol, Value>;

/** Функции проекта, на которые указывает вызов, и имя для `via`. */
export type CalleeFunctions = { readonly name: string; readonly fns: readonly FunctionNode[] };


/** Пустой кадр: параметры не связаны. */
export const EMPTY_FRAME: Frame = new Map();

/** Последнее имя в тексте выражения: `params.id` → `id`, `encodeURIComponent(id)` → `id`. */
export function lastName(text: string): string {
  const names = text.match(/[A-Za-z_$][\w$]*/g) ?? [];
  return names[names.length - 1] ?? 'param';
}

/**
 * Значение как части строки: неизвестное — один динамический сегмент.
 *
 * @param v - значение
 * @param origin - место для новых частей
 * @param name - имя сегмента для неизвестного
 * @returns части
 */
export function partsOf(v: Value, origin: ts.Node, name: string): readonly Part[] {
  if (v.kind === 'str') {
    return v.parts;
  }
  if (v.kind === 'none') {
    return [];
  }
  return [{ kind: 'dyn', name: v.kind === 'unknown' ? v.name : name, origin }];
}

/** Строка из литерала. */
export function lit(text: string, origin: ts.Node): Value {
  return { kind: 'str', parts: [{ kind: 'lit', text, origin }] };
}

/** Значение похоже на заданное: строка без параметров, объект, клиент. */
export function isKnown(v: Value): boolean {
  if (v.kind === 'str') {
    return v.parts.every((p) => p.kind !== 'param');
  }
  return v.kind !== 'none' && v.kind !== 'unknown';
}

/** Внешний модуль, из которого импортирован идентификатор. */
export function importedFrom(checker: ts.TypeChecker, id: ts.Identifier): { module: string; member: string } | undefined {
  const decl = checker.getSymbolAtLocation(id)?.declarations?.[0];
  if (decl === undefined) {
    return undefined;
  }
  let member = 'default';
  if (ts.isImportSpecifier(decl)) {
    member = (decl.propertyName ?? decl.name).text;
  } else if (ts.isNamespaceImport(decl)) {
    member = '*';
  } else if (!ts.isImportClause(decl)) {
    return undefined;
  }
  let n: ts.Node = decl;
  while (!ts.isImportDeclaration(n)) {
    n = n.parent;
  }
  return ts.isStringLiteral(n.moduleSpecifier) ? { module: n.moduleSpecifier.text, member } : undefined;
}

/** Функция из объявления: function, метод, стрелка в константе, свойстве или поле. */
export function functionOfDeclaration(decl: ts.Node): FunctionNode | undefined {
  if ((ts.isFunctionDeclaration(decl) || ts.isMethodDeclaration(decl)) && decl.body !== undefined) {
    return decl;
  }
  const init =
    ts.isVariableDeclaration(decl) || ts.isPropertyAssignment(decl) || ts.isPropertyDeclaration(decl)
      ? decl.initializer
      : undefined;
  if (init !== undefined && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
    return init;
  }
  return undefined;
}

/**
 * Свойство значения: поле объекта, шаг цепочки Eden/Hono, член модуля, поле параметра.
 *
 * @returns значение или undefined, если у значения нет свойств
 */
export function memberOf(target: Value, key: string, origin: ts.Node): Value | undefined {
  if (target.kind === 'obj') {
    return target.props.get(key) ?? { kind: 'none' };
  }
  if (target.kind === 'client' && (target.lib === 'eden' || target.lib === 'hono-rpc')) {
    return key === 'index' ? target : { ...target, segs: [...target.segs, { kind: 'lit', text: key, origin }] };
  }
  if (target.kind === 'module') {
    const member = target.member === '*' || target.member === 'default' ? key : `${target.member}.${key}`;
    return { kind: 'module', module: target.module, member };
  }
  const only = target.kind === 'str' && target.parts.length === 1 ? target.parts[0] : undefined;
  if (only?.kind === 'param') {
    return { kind: 'str', parts: [{ kind: 'param', name: key, origin }] };
  }
  return undefined;
}

/** Ключ доступа: `a.b` → b, `a['b']` → b. */
export function memberKey(expr: ts.PropertyAccessExpression | ts.ElementAccessExpression): string | undefined {
  if (ts.isPropertyAccessExpression(expr)) {
    return expr.name.text;
  }
  const arg = expr.argumentExpression;
  return ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg) ? arg.text : undefined;
}

/** Корневой узел деструктуризации: параметр или объявление переменной. */
export function rootOfBinding(el: ts.BindingElement): ts.Node {
  let n: ts.Node = el;
  while (ts.isBindingElement(n) || ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n)) {
    n = n.parent;
  }
  return n;
}

/** База клиента из аргумента: строка или `{ baseURL }` / `{ prefixUrl }`. */
function baseOf(arg: Value | undefined, key: string, origin: ts.Node): readonly Part[] {
  if (arg === undefined) {
    return [];
  }
  if (arg.kind === 'obj') {
    return baseOf(arg.props.get(key), key, origin);
  }
  return partsOf(arg, origin, 'base');
}

/**
 * Клиент, созданный вызовом: `axios.create`, `ky.create/extend`, `treaty`, `edenTreaty`, `hc`.
 */
export function createdClient(callee: Value, args: readonly Value[], origin: ts.Node): Value | undefined {
  if (callee.kind === 'client' && (callee.lib === 'ky' || callee.lib === 'axios')) {
    return undefined;
  }
  if (callee.kind !== 'module') {
    return undefined;
  }
  const { module, member } = callee;
  if (module === 'axios' && member === 'create') {
    return { kind: 'client', lib: 'axios', base: baseOf(args[0], 'baseURL', origin), segs: [] };
  }
  if (module === 'ky' && (member === 'create' || member === 'extend')) {
    return { kind: 'client', lib: 'ky', base: baseOf(args[0], 'prefixUrl', origin), segs: [] };
  }
  if (module.startsWith('@elysiajs/eden') && (member === 'treaty' || member === 'edenTreaty')) {
    return { kind: 'client', lib: 'eden', base: baseOf(args[0], 'base', origin), segs: [] };
  }
  if (module === 'hono/client' && member === 'hc') {
    return { kind: 'client', lib: 'hono-rpc', base: baseOf(args[0], 'base', origin), segs: [] };
  }
  return undefined;
}
