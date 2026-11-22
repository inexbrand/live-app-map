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

/** Выражение внутри обёртки (скобки, as, !, satisfies, <T>, await) или undefined. */
function wrappedExpression(expr: ts.Expression): ts.Expression | undefined {
  return ts.isParenthesizedExpression(expr) ||
    ts.isAsExpression(expr) ||
    ts.isNonNullExpression(expr) ||
    ts.isSatisfiesExpression(expr) ||
    ts.isTypeAssertionExpression(expr) ||
    ts.isAwaitExpression(expr)
    ? expr.expression
    : undefined;
}

/** Объявление символа: значение или первое из объявлений. */
function declarationOf(sym: ts.Symbol | undefined): ts.Declaration | undefined {
  return sym?.valueDeclaration ?? sym?.declarations?.[0];
}

/** Параметр функции или элемент его деструктуризации. */
function isParameterLike(decl: ts.Declaration): boolean {
  return ts.isParameter(decl) || (ts.isBindingElement(decl) && ts.isParameter(rootOfBinding(decl)));
}

/** Инициализатор константы, поля, члена enum или свойства объекта. */
function initializerOf(decl: ts.Declaration): ts.Expression | undefined {
  if (ts.isEnumMember(decl) || ts.isVariableDeclaration(decl) || ts.isPropertyDeclaration(decl)) {
    return decl.initializer;
  }
  return ts.isPropertyAssignment(decl) ? decl.initializer : undefined;
}

/** Объявление свойства: поле объекта (в т. ч. `{ a }`), член enum, поле класса. */
function isPropertyDeclarationLike(decl: ts.Declaration): boolean {
  return ts.isPropertyAssignment(decl) || ts.isShorthandPropertyAssignment(decl) || ts.isEnumMember(decl) || ts.isPropertyDeclaration(decl);
}

/** Свойство при деструктуризации: из параметра-строки (memberOf) или из объекта. */
function destructured(obj: Value, key: string, origin: ts.Node): Value | undefined {
  if (obj.kind === 'str') {
    return memberOf(obj, key, origin);
  }
  return obj.kind === 'obj' ? obj.props.get(key) : undefined;
}

/** Имя шага Eden `.x({ id })`: первое свойство объекта, иначе текст аргумента. */
function edenParamName(first: ts.Expression | undefined): string {
  const name = first !== undefined && ts.isObjectLiteralExpression(first) ? first.properties[0]?.name?.getText() : undefined;
  return name ?? lastName(first?.getText() ?? 'param');
}

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
      return this.template(expr, frame, origin, next);
    }
    const inner = wrappedExpression(expr);
    return inner === undefined ? this.composite(expr, frame, origin, next) : this.evaluate(inner, frame, origin, next);
  }

  /** Шаблонная строка: литералы и значения подстановок. */
  private template(expr: ts.TemplateExpression, frame: Frame, origin: ts.Node, depth: number): Value {
    const parts: Part[] = [{ kind: 'lit', text: expr.head.text, origin }];
    for (const span of expr.templateSpans) {
      const v = this.evaluate(span.expression, frame, origin, depth);
      parts.push(...partsOf(v, origin, lastName(span.expression.getText())));
      parts.push({ kind: 'lit', text: span.literal.text, origin });
    }
    return { kind: 'str', parts };
  }

  /** Составные выражения: операторы, объект, имя, член, вызов. */
  private composite(expr: ts.Expression, frame: Frame, origin: ts.Node, depth: number): Value {
    if (ts.isBinaryExpression(expr)) {
      return this.binary(expr, frame, origin, depth);
    }
    if (ts.isConditionalExpression(expr)) {
      return this.firstKnown(expr.whenTrue, expr.whenFalse, frame, origin, depth);
    }
    if (ts.isObjectLiteralExpression(expr)) {
      return this.object(expr, frame, origin, depth);
    }
    if (ts.isIdentifier(expr)) {
      return this.identifier(expr, frame, origin, depth);
    }
    if (ts.isPropertyAccessExpression(expr) || ts.isElementAccessExpression(expr)) {
      return this.member(expr, frame, origin, depth);
    }
    if (ts.isCallExpression(expr)) {
      return this.call(expr, frame, origin, depth);
    }
    return { kind: 'unknown', name: lastName((ts.isNewExpression(expr) ? expr.expression : expr).getText()) };
  }

  /** Значение a, если известно, иначе b (`?:`, `??`, `||`). */
  private firstKnown(a: ts.Expression, b: ts.Expression, frame: Frame, origin: ts.Node, depth: number): Value {
    const first = this.evaluate(a, frame, origin, depth);
    return isKnown(first) ? first : this.evaluate(b, frame, origin, depth);
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
      return this.firstKnown(expr.left, expr.right, frame, origin, depth);
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
    const external = this.externalModule(id);
    if (external !== undefined) {
      return external;
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

  /** Импорт из пакета (не из проекта) — значение-модуль; иначе undefined. */
  private externalModule(id: ts.Identifier): Value | undefined {
    const imported = importedFrom(this.ctx.checker, id);
    if (imported === undefined || imported.module.startsWith('.')) {
      return undefined;
    }
    const decl = declarationOf(resolvedSymbol(this.ctx.checker, id));
    return decl === undefined || !isProjectNode(this.ctx, decl) ? { kind: 'module', ...imported } : undefined;
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
    const decl = declarationOf(sym);
    const name = lastName(at.getText());
    if (decl === undefined) {
      return at.getText() === 'fetch' ? { kind: 'fetch' } : { kind: 'unknown', name };
    }
    if (isParameterLike(decl)) {
      return { kind: 'str', parts: [{ kind: 'param', name, origin }] };
    }
    const init = initializerOf(decl);
    if (init !== undefined) {
      return this.evaluate(init, frame, origin, depth);
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
    const v = destructured(obj, key, origin);
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
    const env = this.envValue(expr, text, origin);
    if (env !== undefined) {
      return env;
    }
    const key = memberKey(expr);
    const unknown: Value = { kind: 'unknown', name: key ?? lastName(text) };
    // Объект из кадра (аргумент обёртки) — берём свойство из него.
    const bound = key === undefined ? undefined : this.boundObject(expr.expression, frame);
    if (bound !== undefined) {
      return memberOf(bound, key ?? '', origin) ?? unknown;
    }
    // Свойство с объявлением в проекте (константа-объект, enum, поле класса): читаем только его.
    const declared = this.projectProperty(expr, frame, origin, depth);
    if (declared !== undefined) {
      return declared;
    }
    return this.objectMember(expr.expression, key, frame, origin, depth) ?? unknown;
  }

  /** Свойство вычисленного объекта; без ключа — undefined. */
  private objectMember(target: ts.Expression, key: string | undefined, frame: Frame, origin: ts.Node, depth: number): Value | undefined {
    return key === undefined ? undefined : memberOf(this.evaluate(target, frame, origin, depth), key, origin);
  }

  /** `import.meta.env.X`, `process.env.X` — часть-переменная окружения с базой из env-файла. */
  private envValue(expr: ts.Expression, text: string, origin: ts.Node): Value | undefined {
    const env = /^(?:import\.meta\.env|process\.env)\.(\w+)$/.exec(text)?.[1];
    return env === undefined ? undefined : { kind: 'str', parts: [{ kind: 'env', name: env, base: this.envBase(expr.getSourceFile(), env), origin }] };
  }

  /** Значение имени из кадра (аргумент обёртки); не имя или не в кадре — undefined. */
  private boundObject(expr: ts.Expression, frame: Frame): Value | undefined {
    const sym = ts.isIdentifier(expr) ? this.symbolOf(expr) : undefined;
    return sym === undefined ? undefined : frame.get(sym);
  }

  /** Свойство, объявленное в проекте (поле объекта, enum, класса), — по объявлению; иначе undefined. */
  private projectProperty(expr: ts.PropertyAccessExpression | ts.ElementAccessExpression, frame: Frame, origin: ts.Node, depth: number): Value | undefined {
    const nameNode = ts.isPropertyAccessExpression(expr) ? expr.name : expr.argumentExpression;
    const sym = resolvedSymbol(this.ctx.checker, nameNode);
    const decl = declarationOf(sym);
    if (sym === undefined || decl === undefined || !isProjectNode(this.ctx, decl) || !isPropertyDeclarationLike(decl)) {
      return undefined;
    }
    return this.declared(sym, nameNode, frame, origin, depth);
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
      return { ...callee, segs: [...callee.segs, { kind: 'dyn', name: edenParamName(expr.arguments[0]), origin }] };
    }
    const fn = this.functionsOf(expr.expression)?.fns[0];
    if (fn?.body !== undefined) {
      return this.returnValue(fn, this.bind(fn, args), origin, depth);
    }
    return { kind: 'unknown', name: lastName((expr.arguments[0] ?? expr.expression).getText()) };
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
      const arg = args[i] ?? this.defaultArg(p);
      if (ts.isIdentifier(p.name)) {
        this.setSymbol(frame, p.name, arg);
      } else if (ts.isObjectBindingPattern(p.name)) {
        this.bindPattern(frame, p.name, arg);
      }
    });
    return frame;
  }

  /** Значение параметра без аргумента: значение по умолчанию или none. */
  private defaultArg(p: ts.ParameterDeclaration): Value {
    return p.initializer === undefined ? { kind: 'none' } : this.evaluate(p.initializer, EMPTY_FRAME, p);
  }

  private setSymbol(frame: Map<ts.Symbol, Value>, name: ts.Identifier, value: Value): void {
    const sym = this.ctx.checker.getSymbolAtLocation(name);
    if (sym !== undefined) {
      frame.set(sym, value);
    }
  }

  /** `{ a, b: c }` параметра — свойства объекта-аргумента. */
  private bindPattern(frame: Map<ts.Symbol, Value>, pattern: ts.ObjectBindingPattern, arg: Value): void {
    for (const el of pattern.elements) {
      const v = arg.kind === 'obj' ? arg.props.get((el.propertyName ?? el.name).getText()) : undefined;
      if (v !== undefined && ts.isIdentifier(el.name)) {
        this.setSymbol(frame, el.name, v);
      }
    }
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
    const decl = this.calleeDeclaration(nameNode);
    if (decl === undefined || !isProjectNode(this.ctx, decl)) {
      return undefined;
    }
    const name = ts.isPropertyAccessExpression(callee) ? `${lastName(callee.expression.getText())}.${nameNode.text}` : nameNode.text;
    const fn = functionOfDeclaration(decl);
    const fns = fn === undefined ? this.implementationsOf(decl, nameNode.text) : [fn];
    return fns.length === 0 ? undefined : { name, fns };
  }

  /** Объявление вызываемого имени; у `{ a }` — объявление значения. */
  private calleeDeclaration(nameNode: ts.Identifier | ts.PrivateIdentifier): ts.Declaration | undefined {
    const sym = ts.isIdentifier(nameNode) ? this.symbolOf(nameNode) : this.ctx.checker.getSymbolAtLocation(nameNode);
    const decl = declarationOf(sym);
    return decl !== undefined && ts.isShorthandPropertyAssignment(decl) ? declarationOf(this.ctx.checker.getShorthandAssignmentValueSymbol(decl)) : decl;
  }

  /** Реализации метода интерфейса, которому принадлежит объявление. */
  private implementationsOf(decl: ts.Declaration, method: string): FunctionNode[] {
    const iface = ownerInterface(decl);
    const impls = iface === undefined ? undefined : this.ctx.implementations.get(iface)?.get(method);
    return (impls ?? []).map((b) => b.parent).filter((p): p is FunctionNode => p !== undefined && ts.isFunctionLike(p));
  }
}

