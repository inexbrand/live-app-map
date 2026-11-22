/**
 * Экспортируемые символы файла с комментариями и сигнатурой.
 */
import ts from 'typescript';
import type { CodeSymbol, CodeSymbolKind } from '@live-app-map/schema';
import { commentsOf } from './comments';
import { locationOf, type SourceContext } from './source-context';

/** Предел длины сигнатуры: длинные типы обрезаются многоточием. */
const MAX_SIGNATURE = 200;

/** Символ без id и serviceId — их проставляет сборщик. */
export type FoundSymbol = Omit<CodeSymbol, 'id' | 'serviceId'>;

type FunctionLike = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

/**
 * Сигнатура одной строкой: `(a: string) => Promise<X>`.
 *
 * @param fn - функция
 * @param sf - файл
 * @returns сигнатура
 */
function signatureOf(fn: FunctionLike, sf: ts.SourceFile): string {
  const params = fn.parameters.map((p) => p.getText(sf)).join(', ');
  const ret = fn.type === undefined ? '' : ` => ${fn.type.getText(sf)}`;
  const sig = `(${params})${ret}`.replace(/\s+/g, ' ');
  return sig.length > MAX_SIGNATURE ? `${sig.slice(0, MAX_SIGNATURE - 1)}…` : sig;
}

/** Есть модификатор export. */
function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}

/** Функция или компонент: компонент — имя с заглавной буквы в .tsx/.jsx. */
function functionKind(name: string, sf: ts.SourceFile): CodeSymbolKind {
  return /^[A-Z]/.test(name) && /\.[jt]sx$/.test(sf.fileName) ? 'component' : 'function';
}

/**
 * Экспортируемые функции, компоненты, классы, константы, интерфейсы и типы файла.
 *
 * @param ctx - контекст
 * @param sf - файл
 * @returns символы в порядке объявления
 */
export function collectSymbols(ctx: SourceContext, sf: ts.SourceFile): FoundSymbol[] {
  const out: FoundSymbol[] = [];
  const add = (
    kind: CodeSymbolKind,
    name: ts.Identifier,
    commentNode: ts.Node,
    signature?: string,
  ): void => {
    out.push({
      kind,
      name: name.text,
      location: locationOf(ctx, name),
      ...(signature === undefined ? {} : { signature }),
      ...commentsOf(commentNode, sf),
    });
  };
  for (const d of sf.statements.filter(isExported).flatMap((stmt) => declaredSymbols(stmt, sf))) {
    add(d.kind, d.name, d.stmt, d.signature);
  }
  return out;
}

/** Символ оператора до местоположения и комментариев. */
type DeclaredSymbol = { readonly kind: CodeSymbolKind; readonly name: ts.Identifier; readonly stmt: ts.Statement; readonly signature?: string };

/** Символы экспортированного оператора: функция, класс, интерфейс, тип, переменные. */
function declaredSymbols(stmt: ts.Statement, sf: ts.SourceFile): DeclaredSymbol[] {
  if (ts.isFunctionDeclaration(stmt) && stmt.name !== undefined) {
    return [{ kind: functionKind(stmt.name.text, sf), name: stmt.name, stmt, signature: signatureOf(stmt, sf) }];
  }
  if (ts.isClassDeclaration(stmt) && stmt.name !== undefined) {
    return [{ kind: 'class', name: stmt.name, stmt }];
  }
  if (ts.isInterfaceDeclaration(stmt)) {
    return [{ kind: 'interface', name: stmt.name, stmt }];
  }
  if (ts.isTypeAliasDeclaration(stmt)) {
    return [{ kind: 'type', name: stmt.name, stmt }];
  }
  return ts.isVariableStatement(stmt) ? variableSymbols(stmt, sf) : [];
}

/** Переменные оператора: стрелка или function-выражение — функция с сигнатурой. */
function variableSymbols(stmt: ts.VariableStatement, sf: ts.SourceFile): DeclaredSymbol[] {
  return stmt.declarationList.declarations.flatMap((decl): DeclaredSymbol[] => {
    if (!ts.isIdentifier(decl.name)) {
      return [];
    }
    const init = decl.initializer;
    return init !== undefined && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
      ? [{ kind: functionKind(decl.name.text, sf), name: decl.name, stmt, signature: signatureOf(init, sf) }]
      : [{ kind: 'variable', name: decl.name, stmt }];
  });
}