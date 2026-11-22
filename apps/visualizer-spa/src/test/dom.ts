/**
 * DOM для тестов компонентов: happy-dom на время файла теста.
 *
 * Импортировать первым в файле теста (до React и Testing Library) и вызвать useDom() —
 * DOM включается до тестов файла и снимается после, чтобы тесты без DOM (сокеты, fetch)
 * в том же прогоне видели обычную среду Bun.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeAll } from 'bun:test';

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
