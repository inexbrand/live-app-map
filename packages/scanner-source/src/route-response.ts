/**
 * Ответ обработчика роута по коду: поля возвращаемого объекта, что возвращается
 * (переменная или вызов), HTTP-статусы, которые обработчик ставит явно.
 * Elysia (`return {…}`, `set.status = 404`, `status(404, …)`), Hono (`c.json(x, 201)`),
 * Express (`res.json(x)`, `res.status(404)`, `res.sendStatus(204)`).
 */
import ts from 'typescript';
import { calleeName } from './ts-call';
import type { RouteResponse } from '@live-app-map/schema';

/** Не больше полей и значений в описании. */
const MAX_ITEMS = 12;

/** Вызовы, которые отдают тело ответа: `c.json(body)`, `res.send(body)`, `Response.json(body)`. */
const BODY_CALLS: ReadonlySet<string> = new Set(['json', 'send', 'jsonp']);
/** Вызовы со статусом первым аргументом: `status(404, body)`, `error(404)`, `res.status(404)`. */
const STATUS_CALLS: ReadonlySet<string> = new Set(['status', 'error', 'sendStatus']);

/** Собранное по обработчику. */
type Acc = { readonly fields: Set<string>; readonly values: Set<string>; readonly statuses: Set<number> };


/** Число из литерала. */
function numberOf(e: ts.Expression | undefined): number | undefined {
  return e !== undefined && ts.isNumericLiteral(e) ? Number(e.text) : undefined;
}

/** Без await, скобок и приведений. */
function unwrap(e: ts.Expression): ts.Expression {
  let cur = e;
  while (ts.isAwaitExpression(cur) || ts.isParenthesizedExpression(cur) || ts.isAsExpression(cur) || ts.isSatisfiesExpression(cur)) {
    cur = cur.expression;
  }
  return cur;
}

/** Короткое имя вызова для описания: `f()`, `repo.find()`; длинные цепочки — нет. */
function callLabel(call: ts.CallExpression): string | undefined {
  const c = call.expression;
  if (ts.isIdentifier(c)) {
    return `${c.text}()`;
  }
  if (ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression)) {
    return `${c.expression.text}.${c.name.text}()`;
  }
  return undefined;
}

/** Тело ответа: литерал объекта → поля, переменная или вызов → значение. */
function addBody(acc: Acc, expr: ts.Expression): void {
  const e = unwrap(expr);
  if (ts.isObjectLiteralExpression(e)) {
    addFields(acc, e);
  } else if (ts.isCallExpression(e)) {
    addCallBody(acc, e);
  } else if (ts.isIdentifier(e)) {
    acc.values.add(e.text);
  }
}

/** Поля литерала объекта: `...spread`, имена (вычисляемые — нет). */
function addFields(acc: Acc, e: ts.ObjectLiteralExpression): void {
  for (const p of e.properties) {
    if (ts.isSpreadAssignment(p)) {
      acc.fields.add(`...${p.expression.getText()}`);
    } else if (p.name !== undefined && !ts.isComputedPropertyName(p.name)) {
      acc.fields.add(p.name.getText().replace(/['"]/g, ''));
    }
  }
}

/** Тело из вызова: `json(body)`, `status(404, body)`; прочий вызов — его имя как значение. */
function addCallBody(acc: Acc, e: ts.CallExpression): void {
  const name = calleeName(e) ?? '';
  const body = callBody(e, name);
  if (body !== undefined) {
    addBody(acc, body);
    return;
  }
  const label = STATUS_CALLS.has(name) ? undefined : callLabel(e);
  if (label !== undefined) {
    acc.values.add(label);
  }
}

/** Аргумент-тело вызова ответа: первый у `json`, второй у `status`. */
function callBody(e: ts.CallExpression, name: string): ts.Expression | undefined {
  if (BODY_CALLS.has(name) && e.arguments[0] !== undefined) {
    return e.arguments[0];
  }
  return STATUS_CALLS.has(name) ? e.arguments[1] : undefined;
}

/** Статус из вызова или присваивания. */
function addStatus(acc: Acc, node: ts.Node): void {
  const status = ts.isCallExpression(node) ? callStatuses(node) : assignedStatus(node);
  for (const s of status) {
    acc.statuses.add(s);
  }
}

/** `status(404)`, `res.sendStatus(204)`; Hono: `c.json(body, 201)`. */
function callStatuses(node: ts.CallExpression): number[] {
  const name = calleeName(node) ?? '';
  const first = STATUS_CALLS.has(name) ? numberOf(node.arguments[0]) : undefined;
  const second = BODY_CALLS.has(name) ? numberOf(node.arguments[1]) : undefined;
  return [first, second].filter((n): n is number => n !== undefined);
}

/** `set.status = 404`. */
function assignedStatus(node: ts.Node): number[] {
  const isStatus = ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && /(^|\.)status$/.test(node.left.getText());
  const n = isStatus && ts.isBinaryExpression(node) ? numberOf(node.right) : undefined;
  return n === undefined ? [] : [n];
}

/** Тело функции-обработчика: сам узел, если это не функция. */
function bodyOf(node: ts.Node): ts.Node | undefined {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
    return node.body;
  }
  return node;
}

/**
 * Ответ обработчика.
 *
 * @param handlerBody - тело обработчика (блок или выражение) либо сама функция
 * @returns поля, значения и статусы; undefined — ничего не найдено
 */
export function routeResponse(handlerBody: ts.Node): RouteResponse | undefined {
  const root = bodyOf(handlerBody);
  return root === undefined ? undefined : responseOf(collect(root));
}

/** Тела и статусы по обработчику: return, `res.json()` без return, статусы; вложенные функции — нет. */
function collect(root: ts.Node): Acc {
  const acc: Acc = { fields: new Set(), values: new Set(), statuses: new Set() };
  if (!ts.isBlock(root) && ts.isExpression(root)) {
    addBody(acc, root);
  }
  const visit = (n: ts.Node): void => {
    if (ts.isFunctionLike(n)) {
      return;
    }
    const body = bodyStatement(n);
    if (body !== undefined) {
      addBody(acc, body);
    }
    addStatus(acc, n);
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(root, visit);
  if (!ts.isBlock(root)) {
    addStatus(acc, root);
  }
  return acc;
}

/** Выражение тела в операторе: `return x`; Express — `res.json(body)` без return. */
function bodyStatement(n: ts.Node): ts.Expression | undefined {
  if (ts.isReturnStatement(n)) {
    return n.expression;
  }
  const e = ts.isExpressionStatement(n) ? unwrap(n.expression) : undefined;
  return e !== undefined && ts.isCallExpression(e) && BODY_CALLS.has(calleeName(e) ?? '') ? e : undefined;
}

/** Не больше MAX_ITEMS первых. */
function take<T>(s: ReadonlySet<T>): T[] {
  return [...s].slice(0, MAX_ITEMS);
}

/** Ответ из собранного; ничего — undefined. */
function responseOf(acc: Acc): RouteResponse | undefined {
  const fields = take(acc.fields);
  const values = take(acc.values);
  const statuses = take(acc.statuses).sort((a, b) => a - b);
  if (fields.length + values.length + statuses.length === 0) {
    return undefined;
  }
  return {
    ...(fields.length === 0 ? {} : { fields }),
    ...(values.length === 0 ? {} : { values }),
    ...(statuses.length === 0 ? {} : { statuses }),
  };
}
