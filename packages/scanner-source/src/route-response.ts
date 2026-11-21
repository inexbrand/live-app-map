/**
 * Ответ обработчика роута по коду: поля возвращаемого объекта, что возвращается
 * (переменная или вызов), HTTP-статусы, которые обработчик ставит явно.
 * Elysia (`return {…}`, `set.status = 404`, `status(404, …)`), Hono (`c.json(x, 201)`),
 * Express (`res.json(x)`, `res.status(404)`, `res.sendStatus(204)`).
 */
import ts from 'typescript';
import type { RouteResponse } from '@live-app-map/schema';

/** Не больше полей и значений в описании. */
const MAX_ITEMS = 12;

/** Вызовы, которые отдают тело ответа: `c.json(body)`, `res.send(body)`, `Response.json(body)`. */
const BODY_CALLS: ReadonlySet<string> = new Set(['json', 'send', 'jsonp']);
/** Вызовы со статусом первым аргументом: `status(404, body)`, `error(404)`, `res.status(404)`. */
const STATUS_CALLS: ReadonlySet<string> = new Set(['status', 'error', 'sendStatus']);

/** Собранное по обработчику. */
type Acc = { readonly fields: Set<string>; readonly values: Set<string>; readonly statuses: Set<number> };

/** Имя вызываемой функции: `f()` → f, `a.b()` → b. */
function calleeName(call: ts.CallExpression): string | undefined {
  const c = call.expression;
  return ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : undefined;
}

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
    for (const p of e.properties) {
      if (ts.isSpreadAssignment(p)) {
        acc.fields.add(`...${p.expression.getText()}`);
      } else if (p.name !== undefined && !ts.isComputedPropertyName(p.name)) {
        acc.fields.add(p.name.getText().replace(/['"]/g, ''));
      }
    }
    return;
  }
  if (ts.isCallExpression(e)) {
    const name = calleeName(e);
    const first = e.arguments[0];
    if (name !== undefined && BODY_CALLS.has(name) && first !== undefined) {
      addBody(acc, first);
      return;
    }
    if (name !== undefined && STATUS_CALLS.has(name)) {
      const body = e.arguments[1];
      if (body !== undefined) {
        addBody(acc, body);
      }
      return;
    }
    const label = callLabel(e);
    if (label !== undefined) {
      acc.values.add(label);
    }
    return;
  }
  if (ts.isIdentifier(e)) {
    acc.values.add(e.text);
  }
}

/** Статус из вызова или присваивания. */
function addStatus(acc: Acc, node: ts.Node): void {
  if (ts.isCallExpression(node)) {
    const name = calleeName(node);
    const first = numberOf(node.arguments[0]);
    if (name !== undefined && STATUS_CALLS.has(name) && first !== undefined) {
      acc.statuses.add(first);
    }
    // Hono: `c.json(body, 201)`.
    const second = numberOf(node.arguments[1]);
    if (name !== undefined && BODY_CALLS.has(name) && second !== undefined) {
      acc.statuses.add(second);
    }
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    /(^|\.)status$/.test(node.left.getText())
  ) {
    const n = numberOf(node.right);
    if (n !== undefined) {
      acc.statuses.add(n);
    }
  }
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
  if (root === undefined) {
    return undefined;
  }
  const acc: Acc = { fields: new Set(), values: new Set(), statuses: new Set() };
  if (!ts.isBlock(root) && ts.isExpression(root)) {
    addBody(acc, root);
  }
  const visit = (n: ts.Node): void => {
    if (ts.isFunctionLike(n)) {
      return;
    }
    if (ts.isReturnStatement(n) && n.expression !== undefined) {
      addBody(acc, n.expression);
    }
    // Express: `res.json(body)` без return.
    if (ts.isExpressionStatement(n)) {
      const e = unwrap(n.expression);
      if (ts.isCallExpression(e) && BODY_CALLS.has(calleeName(e) ?? '')) {
        addBody(acc, e);
      }
    }
    addStatus(acc, n);
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(root, visit);
  if (!ts.isBlock(root)) {
    addStatus(acc, root);
  }
  const take = <T>(s: ReadonlySet<T>): T[] => [...s].slice(0, MAX_ITEMS);
  const fields = take(acc.fields);
  const values = take(acc.values);
  const statuses = take(acc.statuses).sort((a, b) => a - b);
  if (fields.length === 0 && values.length === 0 && statuses.length === 0) {
    return undefined;
  }
  return {
    ...(fields.length === 0 ? {} : { fields }),
    ...(values.length === 0 ? {} : { values }),
    ...(statuses.length === 0 ? {} : { statuses }),
  };
}
