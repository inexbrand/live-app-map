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
  for (const stmt of sf.statements) {
    if (!isExported(stmt)) {
      continue;
    }
    if (ts.isFunctionDeclaration(stmt) && stmt.name !== undefined) {
      add(functionKind(stmt.name.text, sf), stmt.name, stmt, signatureOf(stmt, sf));
    } else if (ts.isClassDeclaration(stmt) && stmt.name !== undefined) {
      add('class', stmt.name, stmt);
    } else if (ts.isInterfaceDeclaration(stmt)) {
      add('interface', stmt.name, stmt);
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      add('type', stmt.name, stmt);
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) {
          continue;
        }
        const init = decl.initializer;
        if (init !== undefined && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          add(functionKind(decl.name.text, sf), decl.name, stmt, signatureOf(init, sf));
        } else {
          add('variable', decl.name, stmt);
        }
      }
    }
  }
  return out;
}
