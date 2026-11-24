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

/** EventSource в тестах без сервера: соединение не открывается и событий не шлёт (в happy-dom его нет). */
class SilentEventSource extends EventTarget {
  constructor(readonly url: string) {
    super();
  }
  close(): void {}
}

function register(): void {
  if (!GlobalRegistrator.isRegistered) {
    GlobalRegistrator.register({ url: TEST_PAGE_URL, width: 1440, height: 900 });
  }
  if (Reflect.get(globalThis, 'EventSource') === undefined) {
    Reflect.set(globalThis, 'EventSource', SilentEventSource);
  }
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
}

// Первый импорт: React DOM и Testing Library загружаются уже при наличии DOM.
register();

// Предупреждение React об обновлении вне act — шум: асинхронные ответы (fetch) приходят
// между шагами теста, а проверки ждут их через waitFor.
const consoleError = console.error.bind(console);
console.error = (...args: unknown[]): void => {
  if (typeof args[0] === 'string' && args[0].includes('not wrapped in act(')) {
    return;
  }
  consoleError(...args);
};

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

/**
 * Окно файла не закрывается, а только останавливает свои таймеры: библиотеки, загруженные
 * в первом DOM-файле прогона, держат его requestAnimationFrame (d3-timer у React Flow) —
 * в закрытом окне кадры не приходят, и анимации холста в следующих файлах стоят.
 */
function keepWindowAlive(): void {
  const api: unknown = Reflect.get(globalThis, 'happyDOM');
  if (typeof api !== 'object' || api === null) {
    return;
  }
  const abort: unknown = Reflect.get(api, 'abort');
  if (typeof abort === 'function') {
    Reflect.set(api, 'close', () => Reflect.apply(abort, api, []));
  }
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
    // Дать React доделать запланированную работу, пока window ещё есть.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (GlobalRegistrator.isRegistered) {
      keepWindowAlive();
      await GlobalRegistrator.unregister();
    }
  });
}