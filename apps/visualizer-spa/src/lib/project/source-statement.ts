/**
 * Объявление верхнего уровня по номеру строки: разбор TypeScript, текст
 * вместе с JSDoc над объявлением. Только для dev-сервера (typescript — в Node).
 */
import ts from 'typescript';

/** Найденное объявление: строки с 1 включительно. */
export type Statement = { readonly startLine: number; readonly endLine: number; readonly text: string };

/**
 * Объявление верхнего уровня, в которое попадает строка.
 *
 * @param source - текст файла
 * @param line - строка с 1
 * @returns объявление или null, если строка вне объявлений
 */
export function statementAt(source: string, line: number): Statement | null {
  const sf = ts.createSourceFile('file.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lineOf = (pos: number): number => sf.getLineAndCharacterOfPosition(pos).line + 1;
  for (const st of sf.statements) {
    // getFullStart включает комментарии над объявлением; берём от первого JSDoc
    const docs = ts.getJSDocCommentsAndTags(st).filter(ts.isJSDoc);
    const start = docs[0]?.getStart(sf) ?? st.getStart(sf);
    const startLine = lineOf(start);
    const endLine = lineOf(st.getEnd());
    if (line >= startLine && line <= endLine) {
      return { startLine, endLine, text: source.slice(start, st.getEnd()) };
    }
  }
  return null;
}
