/**
 * Чтение комментариев перед узлом: JSDoc отдельно от обычных.
 */
import ts from 'typescript';
import type { CodeComments } from '@live-app-map/schema';

/**
 * Текст JSDoc без `/**`, `*\/` и ведущих звёздочек.
 *
 * @param raw - комментарий целиком
 * @returns очищенный текст
 */
export function cleanBlockComment(raw: string): string {
  const body = raw.replace(/^\/\*\*?/, '').replace(/\*\/$/, '');
  const lines = body.split('\n').map((l) => l.replace(/^\s*\* ?/, '').trimEnd());
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Комментарии, стоящие перед позицией `pos` (до первого токена).
 * Подряд идущие `//`-строки склеиваются в один комментарий.
 *
 * @param text - текст файла
 * @param pos - позиция, с которой ищем (обычно getFullStart узла)
 * @returns последний JSDoc как doc, обычные комментарии как comments
 */
/** Комментарий начинается на следующей строке после предыдущего строчного (prevEnd < 0 — его не было). */
function isNextLine(text: string, prevEnd: number, pos: number): boolean {
  return prevEnd >= 0 && /^[ \t]*\r?\n[ \t]*$/.test(text.slice(prevEnd, pos));
}

/** Блочный комментарий: текст и JSDoc ли он; пустой — undefined. */
function blockComment(raw: string): { readonly text: string; readonly isDoc: boolean } | undefined {
  const text = cleanBlockComment(raw);
  return text === '' ? undefined : { text, isDoc: raw.startsWith('/**') };
}

/** Строчный комментарий: соседний с предыдущим строчным — продолжение его, пустой — пропуск. */
function addLineComment(comments: string[], raw: string, adjacent: boolean): void {
  const line = raw.replace(/^\/\/+\s?/, '').trim();
  if (adjacent && comments.length > 0) {
    comments[comments.length - 1] = `${comments[comments.length - 1]}\n${line}`;
  } else if (line !== '') {
    comments.push(line);
  }
}

export function commentsAt(text: string, pos: number): CodeComments {
  const ranges = ts.getLeadingCommentRanges(text, pos) ?? [];
  let doc: string | undefined;
  const comments: string[] = [];
  let prevSingleEnd = -1;
  for (const r of ranges) {
    const raw = text.slice(r.pos, r.end);
    if (r.kind === ts.SyntaxKind.SingleLineCommentTrivia) {
      addLineComment(comments, raw, isNextLine(text, prevSingleEnd, r.pos));
      prevSingleEnd = r.end;
      continue;
    }
    prevSingleEnd = -1;
    const block = blockComment(raw);
    if (block?.isDoc === true) {
      doc = block.text;
    } else if (block !== undefined) {
      comments.push(block.text);
    }
  }
  return {
    ...(doc === undefined ? {} : { doc }),
    ...(comments.length === 0 ? {} : { comments }),
  };
}

/**
 * Комментарии перед узлом (учитывая весь его leading trivia).
 *
 * @param node - узел AST
 * @param sf - файл узла
 * @returns doc / comments
 */
export function commentsOf(node: ts.Node, sf: ts.SourceFile): CodeComments {
  return commentsAt(sf.text, node.getFullStart());
}

/**
 * Описание одной строкой-блоком: JSDoc, иначе первый обычный комментарий.
 *
 * @param c - комментарии сущности
 * @returns описание или undefined
 */
export function describe(c: CodeComments): string | undefined {
  return c.doc ?? c.comments?.[0];
}