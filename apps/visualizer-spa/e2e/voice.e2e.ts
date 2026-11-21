/**
 * Голосовой ввод локальной моделью Whisper в браузере.
 * Микрофон Chromium читает e2e/fixtures/voice-ru.wav — фраза «Кнопка отклика
 * налезает на заголовок карточки» (проект voice в playwright.config).
 * Первое использование: браузерный контекст новый (кэша нет), а ответ /size
 * подменяется на «на диске ничего» — окно предлагает скачать. Файлы при этом
 * идут через dev-сервер как обычно: с диска (.lam-models — кэш между прогонами)
 * или, в чистом checkout, с Hugging Face. Модель на сервере тест не удаляет.
 * Звук никуда не уходит: распознаёт браузер.
 */
import { expect, test, type Page } from '@playwright/test';
import { dragRegion, openMiniappAndSelectNode, startRegion } from './helpers';

/** Загрузка в чистом checkout (80 МБ с Hugging Face). */
const DOWNLOAD_MS = 240_000;

async function openComposer(page: Page): Promise<void> {
  await openMiniappAndSelectNode(page);
  await startRegion(page);
  await dragRegion(page);
  await expect(page.getByTestId('comment-composer')).toBeVisible();
}

/** Узнаём сказанное по ключевым словам: точность base на синтезированной речи не дословная. */
function expectPhrase(text: string): void {
  expect(text.toLowerCase()).toMatch(/заголов/);
  expect(text.toLowerCase()).toMatch(/карточк/);
}

test.describe.configure({ mode: 'serial' });

test.describe('голос', () => {
  test('первое использование: предложение скачать → прогресс → ⌥ держать и говорить → текст в поле', async ({ page }) => {
    test.setTimeout(DOWNLOAD_MS + 120_000);
    // Для окна модели ещё нет: сервер отвечает «на диске 0 байт»
    await page.route('**/__lam_models/size?*', async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as Record<string, unknown>;
      await route.fulfill({ response: res, json: { ...body, bytesOnDisk: 0 } });
    });
    // Прогресс с диска может мелькнуть за кадр — запоминаем, что он появлялся
    await page.addInitScript(() => {
      new MutationObserver(() => {
        if (document.querySelector('[data-testid=voice-progress]') !== null) {
          document.documentElement.dataset['voiceProgressSeen'] = '1';
        }
      }).observe(document, { subtree: true, childList: true });
    });
    await page.addInitScript(() => localStorage.setItem('lam-voice', JSON.stringify({ model: 'base', language: 'ru' })));
    await openComposer(page);

    const vb = await page.getByTestId('voice-button').boundingBox();
    await page.mouse.move((vb?.x ?? 0) + 8, (vb?.y ?? 0) + 8);
    await page.mouse.down();
    await page.mouse.up();
    const dialog = page.getByTestId('voice-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('voice-size')).toHaveText(/\d+(,\d+)? МБ/);
    await expect(dialog.getByRole('radiogroup', { name: 'Язык речи' }).getByRole('radio', { name: 'Русский' })).toHaveAttribute('aria-checked', 'true');
    await expect(dialog).toContainText('Звук не уходит');
    await dialog.getByTestId('voice-download').click();
    // Готово или ошибка — что раньше; ошибка загрузки валит тест сразу, с её текстом
    await expect
      .poll(
        async () => {
          if (await dialog.getByRole('button', { name: /Готово/ }).isVisible()) {
            return 'ready';
          }
          const alert = dialog.getByRole('alert');
          // count() не ждёт: textContent() без элемента ждал бы до конца теста
          return (await alert.count()) > 0 ? `ошибка: ${await alert.first().innerText()}` : 'loading';
        },
        { timeout: DOWNLOAD_MS, intervals: [500] },
      )
      .toBe('ready');
    expect(await page.evaluate(() => document.documentElement.dataset['voiceProgressSeen'])).toBe('1');
    await expect(dialog.getByTestId('voice-remove')).toBeVisible();
    await dialog.getByRole('button', { name: /Готово/ }).click();

    const area = page.getByRole('textbox', { name: 'Что не так' });
    await area.focus();
    await page.keyboard.down('Alt');
    await expect(page.getByTestId('voice-draft')).toBeVisible();
    await page.waitForTimeout(6000);
    await page.keyboard.up('Alt');
    await expect.poll(async () => area.inputValue(), { timeout: 60_000 }).not.toBe('');
    expectPhrase(await area.inputValue());

    // Правка до отправки и сохранение
    await area.press('End');
    await area.pressSequentially(' (голос)');
    await page.keyboard.press('Enter');
    await expect(page.locator('.toast')).toContainText('Замечание сохранено');
    await expect(page.getByTestId('screen-comments').getByTestId('comment-thread').first()).toContainText('(голос)');
  });

  test('модель с диска: кнопка — держать и говорить, офлайн', async ({ page, context }) => {
    await page.addInitScript(() => localStorage.setItem('lam-voice', JSON.stringify({ model: 'base', language: 'ru' })));
    await openComposer(page);
    // Интернет не нужен: после загрузки страницы режем внешнюю сеть браузера
    await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost|[^/]*\.localhost)/, (route) => route.abort());
    const button = page.getByTestId('voice-button');
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move((box?.x ?? 0) + 8, (box?.y ?? 0) + 8);
    await page.mouse.down();
    // Модель грузится с диска (без диалога), затем пишет
    await expect(page.getByTestId('voice-draft')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(6000);
    await page.mouse.up();
    const area = page.getByRole('textbox', { name: 'Что не так' });
    await expect.poll(async () => area.inputValue(), { timeout: 60_000 }).not.toBe('');
    expectPhrase(await area.inputValue());
    await expect(page.getByTestId('voice-dialog')).toHaveCount(0);
  });
});
