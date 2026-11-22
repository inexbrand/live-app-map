/**
 * Доступ к роуту: проверки в обработчике, в функциях, которые он вызывает,
 * в `beforeHandle` опций и в плагинах цепочки до роута (`.use(requirePermissionPlugin('x'))`).
 */
import ts from 'typescript';
import { calleeName } from './ts-call';
import type { RouteAccess } from '@live-app-map/schema';
import { calledFunctions } from './db-calls';
import type { SourceContext } from './source-context';

/** Глубина обхода вызываемых функций проекта. */
const MAX_DEPTH = 3;
/** Глубже этого проверки не называются: `requireAdminAccess → requirePermission` видно, их внутренности — нет. */
const CHECK_DEPTH = 1;

/** Имя функции-проверки: `requireAdminAccess`, `assertCanViewCandidate`, `hasPermission`. */
const CHECK_NAME = /^(require|assert|ensure|check|verify|guard|has|can|is)[A-Z]\w*$/;
const CHECK_SUBJECT = /(Role|Permission|Access|Admin|Auth|Viewer|User|Employer|Recruiter|Owner|Surface|Session|Login|Member|Scope|Can)/;
/** Право: `admin.access`, `reports:read`. */
const PERMISSION = /^[a-z][\w-]*([.:][\w*-]+)+$/;
/** Выражение роли: `viewer.role`, `role`, `user.roles`. */
const ROLE_EXPR = /(^|\.)roles?$/i;
/** Ответ «не вошёл». */
const UNAUTHORIZED = /^(UNAUTHORIZED|UNAUTHENTICATED|Unauthorized)$/;
/** Методы цепочки, которые вешают проверки на последующие роуты. */
const CHAIN_HOOKS: ReadonlySet<string> = new Set(['use', 'guard', 'onBeforeHandle', 'derive', 'resolve']);

/** Собранное по обходу. */
type Found = { auth: boolean; roles: Set<string>; permissions: Set<string>; checks: Set<string> };


/** Строковые литералы аргументов вызова. */
function stringArgs(call: ts.CallExpression): string[] {
  return call.arguments.flatMap((a) => (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a) ? [a.text] : []));
}

/** Строка-литерал выражения или undefined. */
function stringOf(expr: ts.Expression): string | undefined {
  return ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr) ? expr.text : undefined;
}

/** Сравнение роли с литералом: `viewer.role !== 'admin'`. */
function roleComparison(node: ts.BinaryExpression): string | undefined {
  const op = node.operatorToken.kind;
  if (
    op !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
    op !== ts.SyntaxKind.ExclamationEqualsEqualsToken &&
    op !== ts.SyntaxKind.EqualsEqualsToken &&
    op !== ts.SyntaxKind.ExclamationEqualsToken
  ) {
    return undefined;
  }
  const left = stringOf(node.left);
  const right = stringOf(node.right);
  if (right !== undefined && ROLE_EXPR.test(node.left.getText())) {
    return right;
  }
  return left !== undefined && ROLE_EXPR.test(node.right.getText()) ? left : undefined;
}

/** `['a', 'b'].includes(viewer.role)` → роли. */
function rolesIncludes(call: ts.CallExpression): string[] {
  const c = call.expression;
  const arg = call.arguments[0];
  if (!ts.isPropertyAccessExpression(c) || c.name.text !== 'includes' || arg === undefined || !ROLE_EXPR.test(arg.getText())) {
    return [];
  }
  return ts.isArrayLiteralExpression(c.expression) ? c.expression.elements.flatMap((e) => stringOf(e) ?? []) : [];
}

/**
 * Обходит узел и функции проекта, которые он вызывает.
 *
 * @param ctx - контекст
 * @param root - тело обработчика, функция проверки или вызов в цепочке
 * @param found - куда складывать
 * @param seen - уже обойдённые тела
 */
function walk(ctx: SourceContext, root: ts.Node, found: Found, seen: Set<ts.Node>): void {
  const visit = (node: ts.Node, depth: number): void => {
    noteNode(node, depth, found);
    const callees = ts.isCallExpression(node) && depth < MAX_DEPTH ? calledFunctions(ctx, node) : [];
    for (const fn of callees) {
      if (!seen.has(fn.node)) {
        seen.add(fn.node);
        visit(fn.node, depth + 1);
      }
    }
    ts.forEachChild(node, (child) => visit(child, depth));
  };
  visit(root, 0);
}

/** Признаки доступа в узле: сравнение роли, 401/Unauthorized, проверка в вызове. */
function noteNode(node: ts.Node, depth: number, found: Found): void {
  const role = ts.isBinaryExpression(node) ? roleComparison(node) : undefined;
  if (role !== undefined) {
    found.roles.add(role);
  }
  if ((ts.isStringLiteral(node) && UNAUTHORIZED.test(node.text)) || (ts.isNumericLiteral(node) && node.text === '401')) {
    found.auth = true;
  }
  if (ts.isCallExpression(node)) {
    noteCall(node, depth, found);
  }
}

/** `roles.includes('admin')`, `requireAdmin()` (имя — у верхних уровней), права в аргументах. */
function noteCall(node: ts.CallExpression, depth: number, found: Found): void {
  rolesIncludes(node).forEach((r) => found.roles.add(r));
  const name = calleeName(node);
  if (name === undefined || !CHECK_NAME.test(name) || !CHECK_SUBJECT.test(name)) {
    return;
  }
  if (depth <= CHECK_DEPTH) {
    found.checks.add(name);
  }
  stringArgs(node)
    .filter((s) => PERMISSION.test(s))
    .forEach((p) => found.permissions.add(p));
}

/** `beforeHandle` из объекта опций роута. */
function beforeHandles(call: ts.CallExpression): ts.Node[] {
  return call.arguments.slice(1).flatMap((arg) =>
    ts.isObjectLiteralExpression(arg)
      ? arg.properties.filter((p) => ts.isPropertyAssignment(p) && p.name.getText() === 'beforeHandle')
      : [],
  );
}

/** Вызовы `.use/.guard/…` в цепочке до роута. */
function chainHooks(call: ts.CallExpression): ts.Node[] {
  const out: ts.Node[] = [];
  let cur: ts.Expression = ts.isPropertyAccessExpression(call.expression) ? call.expression.expression : call.expression;
  while (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression)) {
    if (CHAIN_HOOKS.has(cur.expression.name.text)) {
      out.push(...cur.arguments);
    }
    cur = cur.expression.expression;
  }
  return out;
}

/**
 * Доступ к роуту.
 *
 * @param ctx - контекст
 * @param call - вызов роута
 * @param handlerBody - тело обработчика
 * @returns роли, права, проверки или undefined, если в коде проверок нет
 */
export function routeAccess(ctx: SourceContext, call: ts.CallExpression, handlerBody: ts.Node): RouteAccess | undefined {
  const found: Found = { auth: false, roles: new Set(), permissions: new Set(), checks: new Set() };
  const seen = new Set<ts.Node>([handlerBody]);
  [handlerBody, ...beforeHandles(call), ...chainHooks(call)].forEach((n) => walk(ctx, n, found, seen));
  const sorted = (s: Set<string>): string[] => [...s].sort();
  const hasChecks = found.roles.size + found.permissions.size + found.checks.size > 0;
  if (!found.auth && !hasChecks) {
    return undefined;
  }
  return {
    auth: true,
    ...(found.roles.size === 0 ? {} : { roles: sorted(found.roles) }),
    ...(found.permissions.size === 0 ? {} : { permissions: sorted(found.permissions) }),
    ...(found.checks.size === 0 ? {} : { checks: sorted(found.checks) }),
  };
}
