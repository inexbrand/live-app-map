/**
 * Символьное вычисление выражений для поиска вызовов API: константы, шаблоны,
 * объекты, параметры обёрток, билдеры запросов, клиенты axios/ky/Eden/Hono.
 */
import ts from 'typescript';
import {
  EMPTY_FRAME,
  createdClient,
  importedFrom,
  isKnown,
  lastName,
  lit,
  memberKey,
  memberOf,
  partsOf,
  rootOfBinding,
  functionOfDeclaration,
  type CalleeFunctions,
  type Frame,
  type FunctionNode,
  type Part,
  type Value,
} from './api-value';
import { ownerInterface } from './implementations';
import { isProjectNode, resolvedSymbol, type SourceContext } from './source-context';

/** Предел глубины вычисления (константы через константы, билдеры). */
const MAX_EVAL_DEPTH = 8;

/**
 * Вычислитель значений с доступом к checker и env-файлам.
 */
export class ValueEvaluator {
  constructor(
    private readonly ctx: SourceContext,
    /** База из env для файла: имя переменной → путь или undefined. */
    private readonly envBase: (file: ts.SourceFile, name: string) => string | undefined,
  ) {}

  /**
   * Вычисляет выражение.
   *
   * @param expr - выражение
   * @param frame - значения параметров
   * @param origin - вызов, которому приписываются новые части
   * @param depth - глубина вложенного вычисления
   * @returns значение
   */
  evaluate(expr: ts.Expression, frame: Frame, origin: ts.Node, depth = 0): Value {
    if (depth > MAX_EVAL_DEPTH) {
      return { kind: 'unknown', name: lastName(expr.getText()) };
    }
    const next = depth + 1;
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      return lit(expr.text, origin);
    }
    if (ts.isTemplateExpression(expr)) {
      const parts: Part[] = [{ kind: 'lit', text: expr.head.text, origin }];
      for (const span of expr.templateSpans) {
        const v = this.evaluate(span.expression, frame, origin, next);
        parts.push(...partsOf(v, origin, lastName(span.expression.getText())));
        parts.push({ kind: 'lit', text: span.literal.text, origin });
      }
      return { kind: 'str', parts };
    }
    if (
      ts.isParenthesizedExpression(expr) ||
      ts.isAsExpression(expr) ||
      ts.isNonNullExpression(expr) ||
      ts.isSatisfiesExpression(expr) ||
      ts.isTypeAssertionExpression(expr) ||
      ts.isAwaitExpression(expr)
    ) {
      return this.evaluate(expr.expression, frame, origin, next);
    }
    if (ts.isBinaryExpression(expr)) {
      return this.binary(expr, frame, origin, next);
    }
    if (ts.isConditionalExpression(expr)) {
      const a = this.evaluate(expr.whenTrue, frame, origin, next);
      return isKnown(a) ? a : this.evaluate(expr.whenFalse, frame, origin, next);
    }
    if (ts.isObjectLiteralExpression(expr)) {
      return this.object(expr, frame, origin, next);
    }
    if (ts.isIdentifier(expr)) {
      return this.identifier(expr, frame, origin, next);
    }
    if (ts.isPropertyAccessExpression(expr) || ts.isElementAccessExpression(expr)) {
      return this.member(expr, frame, origin, next);
    }
    if (ts.isCallExpression(expr)) {
      return this.call(expr, frame, origin, next);
    }
    if (ts.isNewExpression(expr)) {
      return { kind: 'unknown', name: lastName(expr.expression.getText()) };
    }
    return { kind: 'unknown', name: lastName(expr.getText()) };
  }

  /** `a + b`, `a ?? b`, `a || b`. */
  private binary(expr: ts.BinaryExpression, frame: Frame, origin: ts.Node, depth: number): Value {
    const op = expr.operatorToken.kind;
    if (op === ts.SyntaxKind.PlusToken) {
      const a = this.evaluate(expr.left, frame, origin, depth);
      const b = this.evaluate(expr.right, frame, origin, depth);
      return {
        kind: 'str',
        parts: [...partsOf(a, origin, lastName(expr.left.getText())), ...partsOf(b, origin, lastName(expr.right.getText()))],
      };
    }
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
      const a = this.evaluate(expr.left, frame, origin, depth);
      return isKnown(a) ? a : this.evaluate(expr.right, frame, origin, depth);
    }
    return { kind: 'unknown', name: lastName(expr.getText()) };
  }

  private object(expr: ts.ObjectLiteralExpression, frame: Frame, origin: ts.Node, depth: number): Value {
    const props = new Map<string, Value>();
    for (const p of expr.properties) {
      if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
        props.set(p.name.text, this.evaluate(p.initializer, frame, origin, depth));
      } else if (ts.isShorthandPropertyAssignment(p)) {
        props.set(p.name.text, this.identifier(p.name, frame, origin, depth));
      } else if (ts.isSpreadAssignment(p)) {
        const spread = this.evaluate(p.expression, frame, origin, depth);
        if (spread.kind === 'obj') {
          for (const [k, v] of spread.props) {
            props.set(k, v);
          }
        }
      }
    }
    return { kind: 'obj', props };
  }

  private identifier(id: ts.Identifier, frame: Frame, origin: ts.Node, depth: number): Value {
    if (id.text === 'undefined') {
      return { kind: 'none' };
    }
    const imported = importedFrom(this.ctx.checker, id);
    if (imported !== undefined && !imported.module.startsWith('.')) {
      const sym = resolvedSymbol(this.ctx.checker, id);
      const decl = sym?.valueDeclaration ?? sym?.declarations?.[0];
      if (decl === undefined || !isProjectNode(this.ctx, decl)) {
        return { kind: 'module', ...imported };
      }
    }
    const sym = this.symbolOf(id);
    if (sym === undefined) {
      return id.text === 'fetch' ? { kind: 'fetch' } : { kind: 'unknown', name: id.text };
    }
    const bound = frame.get(sym);
    if (bound !== undefined) {
      return bound;
    }
    return this.declared(sym, id, frame, origin, depth);
  }

  /** Символ идентификатора; у `{ a }` в литерале — символ значения. */
  private symbolOf(id: ts.Identifier): ts.Symbol | undefined {
    if (ts.isShorthandPropertyAssignment(id.parent)) {
      return this.ctx.checker.getShorthandAssignmentValueSymbol(id.parent);
    }
    return resolvedSymbol(this.ctx.checker, id);
  }

  /** Значение по объявлению символа: константа, член enum, параметр, поле класса. */
  private declared(sym: ts.Symbol, at: ts.Node, frame: Frame, origin: ts.Node, depth: number): Value {
    const decl = sym.valueDeclaration ?? sym.declarations?.[0];
    const name = lastName(at.getText());
    if (decl === undefined) {
      return at.getText() === 'fetch' ? { kind: 'fetch' } : { kind: 'unknown', name };
    }
    if (ts.isParameter(decl) || (ts.isBindingElement(decl) && ts.isParameter(rootOfBinding(decl)))) {
      return { kind: 'str', parts: [{ kind: 'param', name, origin }] };
    }
    if (ts.isEnumMember(decl) && decl.initializer !== undefined) {
      return this.evaluate(decl.initializer, frame, origin, depth);
    }
    if ((ts.isVariableDeclaration(decl) || ts.isPropertyDeclaration(decl)) && decl.initializer !== undefined) {
      return this.evaluate(decl.initializer, frame, origin, depth);
    }
    if (ts.isPropertyAssignment(decl)) {
      return this.evaluate(decl.initializer, frame, origin, depth);
    }
    if (ts.isShorthandPropertyAssignment(decl)) {
      const value = this.ctx.checker.getShorthandAssignmentValueSymbol(decl);
      return value === undefined ? { kind: 'unknown', name } : this.declared(value, at, frame, origin, depth);
    }
    if (ts.isBindingElement(decl)) {
      return this.bindingValue(decl, frame, origin, depth);
    }
    return { kind: 'unknown', name };
  }

  /** `const { method } = options` → options.method. */
  private bindingValue(decl: ts.BindingElement, frame: Frame, origin: ts.Node, depth: number): Value {
    const pattern = decl.parent;
    const holder = pattern.parent;
    if (!ts.isObjectBindingPattern(pattern) || !ts.isVariableDeclaration(holder) || holder.initializer === undefined) {
      return { kind: 'unknown', name: decl.name.getText() };
    }
    const obj = this.evaluate(holder.initializer, frame, origin, depth);
    const key = (decl.propertyName ?? decl.name).getText();
    const fromParam = memberOf(obj, key, origin);
    if (obj.kind === 'str' && fromParam !== undefined) {
      return fromParam;
    }
    const v = obj.kind === 'obj' ? obj.props.get(key) : undefined;
    if (v !== undefined) {
      return v;
    }
    return decl.initializer === undefined ? { kind: 'unknown', name: key } : this.evaluate(decl.initializer, frame, origin, depth);
  }

  /** `a.b`, `a['b']`, `import.meta.env.X`, `process.env.X`, шаг цепочки Eden/Hono. */
  private member(
    expr: ts.PropertyAccessExpression | ts.ElementAccessExpression,
    frame: Frame,
    origin: ts.Node,
    depth: number,
  ): Value {
    const text = expr.getText();
    const env = /^(?:import\.meta\.env|process\.env)\.(\w+)$/.exec(text);
    if (env?.[1] !== undefined) {
      return {
        kind: 'str',
        parts: [{ kind: 'env', name: env[1], base: this.envBase(expr.getSourceFile(), env[1]), origin }],
      };
    }
    const key = memberKey(expr);
    const unknown: Value = { kind: 'unknown', name: key ?? lastName(text) };
    // Объект из кадра (аргумент обёртки) — берём свойство из него.
    if (key !== undefined && ts.isIdentifier(expr.expression)) {
      const sym = this.symbolOf(expr.expression);
      const bound = sym === undefined ? undefined : frame.get(sym);
      if (bound !== undefined) {
        return memberOf(bound, key, origin) ?? unknown;
      }
    }
    // Свойство с объявлением в проекте (константа-объект, enum, поле класса): читаем только его.
    const nameNode = ts.isPropertyAccessExpression(expr) ? expr.name : expr.argumentExpression;
    const sym = resolvedSymbol(this.ctx.checker, nameNode);
    const decl = sym?.valueDeclaration ?? sym?.declarations?.[0];
    if (
      sym !== undefined &&
      decl !== undefined &&
      isProjectNode(this.ctx, decl) &&
      (ts.isPropertyAssignment(decl) ||
        ts.isShorthandPropertyAssignment(decl) ||
        ts.isEnumMember(decl) ||
        ts.isPropertyDeclaration(decl))
    ) {
      return this.declared(sym, nameNode, frame, origin, depth);
    }
    if (key === undefined) {
      return unknown;
    }
    return memberOf(this.evaluate(expr.expression, frame, origin, depth), key, origin) ?? unknown;
  }

  /** Вызов внутри выражения: создание клиента, шаг Eden, билдер проекта. */
  private call(expr: ts.CallExpression, frame: Frame, origin: ts.Node, depth: number): Value {
    const callee = this.evaluate(expr.expression, frame, origin, depth);
    const args = expr.arguments.map((a) => this.evaluate(a, frame, origin, depth));
    const created = createdClient(callee, args, origin);
    if (created !== undefined) {
      return created;
    }
    if (callee.kind === 'client' && callee.lib === 'eden') {
      const first = expr.arguments[0];
      const name = first !== undefined && ts.isObjectLiteralExpression(first) ? first.properties[0]?.name?.getText() : undefined;
      return { ...callee, segs: [...callee.segs, { kind: 'dyn', name: name ?? lastName(first?.getText() ?? 'param'), origin }] };
    }
    const target = this.functionsOf(expr.expression);
    const fn = target?.fns[0];
    if (fn !== undefined && fn.body !== undefined) {
      return this.returnValue(fn, this.bind(fn, args), origin, depth);
    }
    const first = expr.arguments[0];
    return { kind: 'unknown', name: first === undefined ? lastName(expr.expression.getText()) : lastName(first.getText()) };
  }

  /**
   * Значения параметров функции по аргументам; деструктуризация `{ a, b }` поддерживается.
   *
   * @param fn - функция
   * @param args - значения аргументов
   * @returns кадр
   */
  bind(fn: FunctionNode, args: readonly Value[]): Frame {
    const frame = new Map<ts.Symbol, Value>();
    fn.parameters.forEach((p, i) => {
      const arg = args[i] ?? (p.initializer === undefined ? { kind: 'none' } : this.evaluate(p.initializer, EMPTY_FRAME, p));
      if (ts.isIdentifier(p.name)) {
        const sym = this.ctx.checker.getSymbolAtLocation(p.name);
        if (sym !== undefined) {
          frame.set(sym, arg);
        }
        return;
      }
      if (ts.isObjectBindingPattern(p.name)) {
        for (const el of p.name.elements) {
          const sym = ts.isIdentifier(el.name) ? this.ctx.checker.getSymbolAtLocation(el.name) : undefined;
          const key = (el.propertyName ?? el.name).getText();
          const v = arg.kind === 'obj' ? arg.props.get(key) : undefined;
          if (sym !== undefined && v !== undefined) {
            frame.set(sym, v);
          }
        }
      }
    });
    return frame;
  }

  /** Значение первого `return` функции (или тела-выражения стрелки). */
  private returnValue(fn: FunctionNode, frame: Frame, origin: ts.Node, depth: number): Value {
    const body = fn.body;
    if (body === undefined) {
      return { kind: 'unknown', name: 'return' };
    }
    if (!ts.isBlock(body)) {
      return ts.isExpression(body) ? this.evaluate(body, frame, origin, depth) : { kind: 'unknown', name: 'return' };
    }
    let found: ts.Expression | undefined;
    const visit = (n: ts.Node): void => {
      if (found !== undefined || ts.isFunctionLike(n)) {
        return;
      }
      if (ts.isReturnStatement(n) && n.expression !== undefined) {
        found = n.expression;
        return;
      }
      ts.forEachChild(n, visit);
    };
    ts.forEachChild(body, visit);
    return found === undefined ? { kind: 'unknown', name: 'return' } : this.evaluate(found, frame, origin, depth);
  }

  /**
   * Функции проекта, которые вызывает выражение: объявление, стрелка в константе,
   * метод объекта или класса, реализации метода интерфейса.
   *
   * @param callee - выражение слева от скобок
   * @returns функции и имя для via или undefined
   */
  functionsOf(callee: ts.Expression): CalleeFunctions | undefined {
    const nameNode = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
    if (!ts.isIdentifier(nameNode) && !ts.isPrivateIdentifier(nameNode)) {
      return undefined;
    }
    const sym = ts.isIdentifier(nameNode) ? this.symbolOf(nameNode) : this.ctx.checker.getSymbolAtLocation(nameNode);
    let decl = sym?.valueDeclaration ?? sym?.declarations?.[0];
    if (decl !== undefined && ts.isShorthandPropertyAssignment(decl)) {
      const value = this.ctx.checker.getShorthandAssignmentValueSymbol(decl);
      decl = value?.valueDeclaration ?? value?.declarations?.[0];
    }
    if (decl === undefined || !isProjectNode(this.ctx, decl)) {
      return undefined;
    }
    const name = ts.isPropertyAccessExpression(callee) ? `${lastName(callee.expression.getText())}.${nameNode.text}` : nameNode.text;
    const fn = functionOfDeclaration(decl);
    if (fn !== undefined) {
      return { name, fns: [fn] };
    }
    const iface = ownerInterface(decl);
    const impls = iface === undefined ? undefined : this.ctx.implementations.get(iface)?.get(nameNode.text);
    const fns = (impls ?? []).map((b) => b.parent).filter((p): p is FunctionNode => p !== undefined && ts.isFunctionLike(p));
    return fns.length === 0 ? undefined : { name, fns };
  }
}

