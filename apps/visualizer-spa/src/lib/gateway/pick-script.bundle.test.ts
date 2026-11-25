/**
 * Пикер встраивается в страницу текстом функций (toString), а сервер берёт их из
 * собранного vite.config. Сборщик переименовывает импорт, если одно имя из
 * внешнего пакета (@live-app-map/sdk/runtime) пришло двумя путями: в тексте
 * остаётся вызов componentNameOf2, которого на странице нет. Тест собирает
 * pick-script так же — Bun.build с внешним sdk — и зовёт пикер из текста.
 */
import { afterAll, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import path from 'node:path';

const outdir = path.join(import.meta.dir, '../../../node_modules/.cache/pick-script-bundle-test');

afterAll(() => rmSync(outdir, { recursive: true, force: true }));

test('текст пикера из сборки: функции зовут друг друга по именам, которые в тексте объявлены', async () => {
  const built = await Bun.build({
    entrypoints: [path.join(import.meta.dir, 'pick-script.ts')],
    outdir,
    target: 'bun',
    external: ['@live-app-map/sdk', '@live-app-map/sdk/*'],
  });
  expect(built.success).toBe(true);
  const entry = built.outputs[0]?.path ?? '';
  const mod: unknown = await import(entry);
  const text = (mod as { pickerScriptText: () => string }).pickerScriptText();
  const chainOf = new Function(`${text}\nreturn componentChainOf;`)() as (host: unknown) => string[];
  function Card(): null {
    return null;
  }
  function Page(): null {
    return null;
  }
  const host = { return: { type: Card, return: { type: Page, return: null } } };
  expect(chainOf(host)).toEqual(['Card', 'Page']);
});
