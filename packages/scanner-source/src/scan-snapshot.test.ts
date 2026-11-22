/**
 * Полный результат скана фикстур репозитория — раздел code карты, как его видит
 * пользователь: сервисы, символы, роуты, таблицы, вызовы, экраны и диагностика.
 * Снимок фиксирует поведение: правка сканера, меняющая вывод, видна в диффе снимка.
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { scanSource } from './index';

const FIXTURES = path.resolve(import.meta.dir, '../../../fixtures');

/** Результат без машинно-зависимого: абсолютный корень — `<root>`, без времени скана. */
function stable(root: string): unknown {
  const { code, diagnostics, stats } = scanSource({ root });
  return JSON.parse(JSON.stringify({ code, diagnostics, files: stats.files }).replaceAll(root, '<root>'));
}

describe('scanSource: снимок фикстур', () => {
  for (const name of readdirSync(FIXTURES).sort()) {
    test(name, () => {
      expect(stable(path.join(FIXTURES, name))).toMatchSnapshot();
    });
  }
});
