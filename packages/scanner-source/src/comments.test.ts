/**
 * Комментарии перед узлом: склейка строчных, JSDoc отдельно, описание одной строкой.
 */
import { describe as group, expect, test } from 'bun:test';
import type { CodeComments } from '@live-app-map/schema';
import { commentsAt, describe } from './comments';

const CASES: Array<[string, string, CodeComments]> = [
  ["склейка подряд идущих строк", "// a\n// b\nx", {"comments":["a\nb"]}],
  ["пустая строка разделяет", "// a\n\n// b\nx", {"comments":["a","b"]}],
  ["пустой строчный пропускается", "//\n// b\nx", {"comments":["b"]}],
  ["блок разрывает склейку", "// a\n/* blk */\n// c\nx", {"comments":["a","blk","c"]}],
  ["последний непустой JSDoc", "/** doc1 */\n/** doc2 */\n/* */\n/** */\nx", {"doc":"doc2"}],
  ["строчный с блоком внутри", "// a /* b */\nx", {"comments":["a /* b */"]}],
  ["без комментариев", "x", {}],
  ["CRLF", "// a\r\n// b\r\nx", {"comments":["a\nb"]}],
  ["отступ", "// a\n  // b\nx", {"comments":["a\nb"]}],
  ["два // в строке", "// a // b\nx", {"comments":["a // b"]}],
];

group('commentsAt', () => {
  test.each(CASES)('%s', (_name, text, expected) => {
    expect(commentsAt(text, 0)).toEqual(expected);
  });
});

test('describe: JSDoc, иначе первый обычный, иначе ничего', () => {
  expect([describe({}), describe({ comments: ['c1', 'c2'] }), describe({ doc: 'd', comments: ['c'] })]).toEqual([undefined, 'c1', 'd']);
});
