/**
 * DOM для тестов компонентов: happy-dom на время файла теста.
 *
 * Импортировать первым в файле теста (до React и Testing Library) и вызвать useDom() —
 * DOM включается до тестов файла и снимается после, чтобы тесты без DOM (сокеты, fetch)
 * в том же прогоне видели обычную среду Bun.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeAll } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BoundFunctions, queries } from '@testing-library/dom';

/** Запросы Testing Library, привязанные к контейнеру (within). */
export type Ui = BoundFunctions<typeof queries>;

/** Адрес страницы в тестах: как у dev-сервера визуализатора. */
export const TEST_PAGE_URL = 'http://localhost:4310/';

function register(): void {
  if (!GlobalRegistrator.isRegistered) {
    GlobalRegistrator.register({ url: TEST_PAGE_URL, width: 1440, height: 900 });
  }
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
}

// Первый импорт: React DOM и Testing Library загружаются уже при наличии DOM.
register();

/**
 * Снимок разметки для доказательства «DOM до и после рефакторинга тот же»: при заданной
 * LAM_DOM_DUMP пишет HTML в эту папку под именем снимка; без неё ничего не делает.
 *
 * @param name - имя снимка (уникальное в прогоне)
 * @param el - что снимать
 */
export function dumpDom(name: string, el: Element): void {
  const dir = process.env['LAM_DOM_DUMP'];
  if (dir === undefined || dir === '') {
    return;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name.replace(/[^\w.-]+/g, '_')}.html`), el.outerHTML);
}

/** Включает DOM на время файла теста и чистит отрисованное после каждого теста. */
export function useDom(): void {
  beforeAll(register);
  afterEach(async () => {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
    document.body.innerHTML = '';
  });
  afterAll(async () => {
    if (GlobalRegistrator.isRegistered) {
      await GlobalRegistrator.unregister();
    }
  });
}