import { describe, expect, test } from 'bun:test';
import { statementAt } from './source-statement';

const FILE = [
  "import { pgTable, text } from 'drizzle-orm/pg-core';", // 1
  '', // 2
  '/** Пользователи. */', // 3
  "export const users = pgTable('users', {", // 4
  "  id: text('id').primaryKey(),", // 5
  '});', // 6
  '', // 7
  "export const posts = pgTable('posts', { id: text('id') });", // 8
].join('\n');

describe('statementAt', () => {
  test('объявление со строки начала — целиком и с JSDoc', () => {
    expect(statementAt(FILE, 4)).toEqual({
      startLine: 3,
      endLine: 6,
      text: "/** Пользователи. */\nexport const users = pgTable('users', {\n  id: text('id').primaryKey(),\n});",
    });
  });

  test('строка внутри объявления даёт то же объявление', () => {
    expect(statementAt(FILE, 5)?.startLine).toBe(3);
  });

  test('однострочное объявление', () => {
    expect(statementAt(FILE, 8)).toEqual({ startLine: 8, endLine: 8, text: "export const posts = pgTable('posts', { id: text('id') });" });
  });

  test('пустая строка между объявлениями — ничего', () => {
    expect(statementAt(FILE, 7)).toBeNull();
  });
});
