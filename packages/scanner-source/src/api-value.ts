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

/** Имя импорта: `{ a as b }` — a, `* as x` — *, `x` — default; не импорт — undefined. */
function importedMember(decl: ts.Declaration): string | undefined {
  if (ts.isImportSpecifier(decl)) {
    return (decl.propertyName ?? decl.name).text;
  }
  if (ts.isNamespaceImport(decl)) {
    return '*';
  }
  return ts.isImportClause(decl) ? 'default' : undefined;
}

/** Внешний модуль, из которого импортирован идентификатор. */
export function importedFrom(checker: ts.TypeChecker, id: ts.Identifier): { module: string; member: string } | undefined {
  const decl = checker.getSymbolAtLocation(id)?.declarations?.[0];
  const member = decl === undefined ? undefined : importedMember(decl);
  if (decl === undefined || member === undefined) {
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
  const init = valueInitializer(decl);
  return init !== undefined && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) ? init : undefined;
}

/** Инициализатор константы, свойства объекта или поля класса. */
function valueInitializer(decl: ts.Node): ts.Expression | undefined {
  return ts.isVariableDeclaration(decl) || ts.isPropertyAssignment(decl) || ts.isPropertyDeclaration(decl) ? decl.initializer : undefined;
}

/**
 * Свойство значения: поле объекта, шаг цепочки Eden/Hono, член модуля, поле параметра.
 *
 * @returns значение или undefined, если у значения нет свойств
 */
export function memberOf(target: Value, key: string, origin: ts.Node): Value | undefined {
  switch (target.kind) {
    case 'obj':
      return target.props.get(key) ?? { kind: 'none' };
    case 'client':
      return chainMember(target, key, origin);
    case 'module':
      return { kind: 'module', module: target.module, member: target.member === '*' || target.member === 'default' ? key : `${target.member}.${key}` };
    case 'str':
      return paramMember(target, key, origin);
    default:
      return undefined;
  }
}

/** Шаг цепочки Eden/Hono: `.index` — то же место, иначе новый сегмент; у axios/ky членов нет. */
function chainMember(target: Value & { readonly kind: 'client' }, key: string, origin: ts.Node): Value | undefined {
  if (target.lib !== 'eden' && target.lib !== 'hono-rpc') {
    return undefined;
  }
  return key === 'index' ? target : { ...target, segs: [...target.segs, { kind: 'lit', text: key, origin }] };
}

/** Свойство параметра-строки: `options.url` → параметр url. */
function paramMember(target: Value & { readonly kind: 'str' }, key: string, origin: ts.Node): Value | undefined {
  return target.parts.length === 1 && target.parts[0]?.kind === 'param' ? { kind: 'str', parts: [{ kind: 'param', name: key, origin }] } : undefined;
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
  if (callee.kind !== 'module') {
    return undefined;
  }
  const factory = CLIENT_FACTORIES.find((f) => f.module(callee.module) && f.members.includes(callee.member));
  return factory === undefined ? undefined : { kind: 'client', lib: factory.lib, base: baseOf(args[0], factory.baseKey, origin), segs: [] };
}

/** Фабрики клиентов: модуль, функции создания, ключ базы в первом аргументе. */
const CLIENT_FACTORIES: readonly { readonly lib: ClientLib; readonly module: (m: string) => boolean; readonly members: readonly string[]; readonly baseKey: string }[] = [
  { lib: 'axios', module: (m) => m === 'axios', members: ['create'], baseKey: 'baseURL' },
  { lib: 'ky', module: (m) => m === 'ky', members: ['create', 'extend'], baseKey: 'prefixUrl' },
  { lib: 'eden', module: (m) => m.startsWith('@elysiajs/eden'), members: ['treaty', 'edenTreaty'], baseKey: 'base' },
  { lib: 'hono-rpc', module: (m) => m === 'hono/client', members: ['hc'], baseKey: 'base' },
];
