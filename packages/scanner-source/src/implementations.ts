/**
 * Реализации интерфейсов: `class X implements Repo` и фабрики
 * `function createRepo(): Repo { return { method() {…} } }`.
 * Нужны, чтобы от вызова `repo.getById()` дойти до запроса в БД.
 */
import ts from 'typescript';

/** Интерфейс → метод → тела реализаций. */
export type ImplementationIndex = ReadonlyMap<string, ReadonlyMap<string, readonly ts.Node[]>>;

/** Имя типа из аннотации: `Repo` или `Promise<Repo>`. */
function typeName(type: ts.TypeNode | undefined): string | undefined {
  if (type === undefined || !ts.isTypeReferenceNode(type)) {
    return undefined;
  }
  const name = type.typeName.getText();
  if (name === 'Promise') {
    return typeName(type.typeArguments?.[0]);
  }
  return name;
}

/** Методы объектного литерала: `m() {}`, `m: () => {}`. */
function objectMethods(obj: ts.ObjectLiteralExpression): [string, ts.Node][] {
  const out: [string, ts.Node][] = [];
  for (const p of obj.properties) {
    if (ts.isMethodDeclaration(p) && p.body !== undefined) {
      out.push([p.name.getText(), p.body]);
    } else if (
      ts.isPropertyAssignment(p) &&
      (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer))
    ) {
      out.push([p.name.getText(), p.initializer.body]);
    }
  }
  return out;
}

/** Объектные литералы из `return {…}` тела функции (без вложенных функций). */
function returnedObjects(body: ts.Node): ts.ObjectLiteralExpression[] {
  if (ts.isObjectLiteralExpression(body)) {
    return [body];
  }
  if (ts.isParenthesizedExpression(body)) {
    return returnedObjects(body.expression);
  }
  const out: ts.ObjectLiteralExpression[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isFunctionLike(n)) {
      return;
    }
    if (ts.isReturnStatement(n) && n.expression !== undefined) {
      out.push(...returnedObjects(n.expression));
      return;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(body, visit);
  return out;
}

/**
 * Строит индекс реализаций по файлам проекта.
 *
 * @param files - исходники проекта
 * @returns интерфейс → метод → тела
 */
/** Реализации в узле: фабрика с типом-интерфейсом результата или класс с `implements`. */
function nodeMethods(node: ts.Node): [string, string, ts.Node][] {
  if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return factoryMethods(node.type, node.body);
  }
  return ts.isClassDeclaration(node) ? classMethods(node) : [];
}

/** Методы объектов, которые возвращает фабрика `(): Repo => ({ … })`. */
function factoryMethods(type: ts.TypeNode | undefined, body: ts.Node | undefined): [string, string, ts.Node][] {
  const iface = typeName(type);
  if (iface === undefined || body === undefined) {
    return [];
  }
  return returnedObjects(body).flatMap((obj) => [...objectMethods(obj)].map(([m, b]): [string, string, ts.Node] => [iface, m, b]));
}

/** Методы класса с телом для каждого интерфейса из `implements`. */
function classMethods(node: ts.ClassDeclaration): [string, string, ts.Node][] {
  const ifaces = (node.heritageClauses ?? [])
    .filter((h) => h.token === ts.SyntaxKind.ImplementsKeyword)
    .flatMap((h) => h.types.map((t) => t.expression.getText()));
  return node.members.filter(ts.isMethodDeclaration).flatMap((member): [string, string, ts.Node][] => {
    const body = member.body;
    return body === undefined ? [] : ifaces.map((iface): [string, string, ts.Node] => [iface, member.name.getText(), body]);
  });
}

export function indexImplementations(files: readonly ts.SourceFile[]): ImplementationIndex {
  const index = new Map<string, Map<string, ts.Node[]>>();
  const add = (iface: string, method: string, body: ts.Node): void => {
    const methods = index.get(iface) ?? new Map<string, ts.Node[]>();
    methods.set(method, [...(methods.get(method) ?? []), body]);
    index.set(iface, methods);
  };
  const visit = (node: ts.Node): void => {
    nodeMethods(node).forEach(([iface, m, b]) => add(iface, m, b));
    ts.forEachChild(node, visit);
  };
  for (const sf of files) {
    visit(sf);
  }
  return index;
}

/**
 * Интерфейс, которому принадлежит объявление метода: `interface Repo { get(): … }`
 * или `type Repo = { get(): … }`.
 *
 * @param decl - объявление метода
 * @returns имя интерфейса или undefined
 */
export function ownerInterface(decl: ts.Declaration): string | undefined {
  if (!ts.isMethodSignature(decl) && !ts.isPropertySignature(decl)) {
    return undefined;
  }
  const parent = decl.parent;
  if (ts.isInterfaceDeclaration(parent)) {
    return parent.name.text;
  }
  if (ts.isTypeLiteralNode(parent) && ts.isTypeAliasDeclaration(parent.parent)) {
    return parent.parent.name.text;
  }
  return undefined;
}
