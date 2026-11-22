/**
 * Общие разборы вызовов в AST TypeScript для сканеров роутов.
 */
import ts from 'typescript';

/**
 * Имя вызываемой функции: `f()` → f, `a.b()` → b.
 *
 * @param call - вызов
 */
export function calleeName(call: ts.CallExpression): string | undefined {
  const c = call.expression;
  return ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : undefined;
}
