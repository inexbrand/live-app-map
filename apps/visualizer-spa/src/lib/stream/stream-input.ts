/**
 * Ввод карты в страницу трансляции.
 */
import type { Page } from '@playwright/test';
import type { PageInput } from './stream-protocol';

/**
 * Ввод через Playwright: мышь, колесо, клавиши. Печатный символ — type (вне
 * раскладки Playwright вставляет текст), служебная клавиша — down/up.
 *
 * @param page - страница экрана
 * @param input - мышь, колесо или клавиша
 */
export async function dispatchInput(page: Page, input: PageInput): Promise<void> {
  if (input.kind === 'mouse') {
    await page.mouse.move(input.x, input.y);
    if (input.type === 'down') {
      await page.mouse.down({ button: input.button, clickCount: input.clickCount });
    }
    if (input.type === 'up') {
      await page.mouse.up({ button: input.button, clickCount: input.clickCount });
    }
    return;
  }
  if (input.kind === 'wheel') {
    await page.mouse.move(input.x, input.y);
    await page.mouse.wheel(input.dx, input.dy);
    return;
  }
  if ([...input.key].length === 1) {
    if (input.type === 'down') {
      await page.keyboard.type(input.key);
    }
    return;
  }
  await (input.type === 'down' ? page.keyboard.down(input.key) : page.keyboard.up(input.key));
}
