/**
 * Голосовой ввод локальной моделью Whisper в браузере.
 * Микрофон Chromium читает e2e/fixtures/voice-ru.wav — фраза «Кнопка отклика
 * налезает на заголовок карточки» (проект voice в playwright.config).
 * Первый тест удаляет модель с диска и скачивает заново: это путь первого
 * использования (предложение, размер, прогресс). Модель идёт через dev-сервер
 * (/__lam_models), звук никуда не уходит.
 */
import { expect, test, type Page } from '@playwright/test';
import { dragRegion, openMiniappAndSelectNode } from './helpers';

const REPO = 'onnx-community/whisper-base';

async function openComposer(page: Page): Promise<void> {
  await openMiniappAndSelectNode(page);
  await page.getByTestId('screen-comments').getByRole('button', { name: 'Область' }).click();
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
    // Модели нет ни на диске, ни в кэше браузера (контекст новый)
    const del = await page.request.delete(`/__lam_models/hf/${REPO}`);
    expect(del.ok()).toBe(true);
    await page.addInitScript(() => localStorage.setItem('lam-voice', JSON.stringify({ model: 'base', language: 'ru' })));
    await openComposer(page);

    await page.getByTestId('voice-button').dispatchEvent('pointerdown');
    const dialog = page.getByTestId('voice-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('voice-size')).toHaveText(/\d+(,\d+)? МБ/);
    await expect(dialog.getByRole('radiogroup', { name: 'Язык речи' }).getByRole('radio', { name: 'Русский' })).toHaveAttribute('aria-checked', 'true');
    await expect(dialog).toContainText('Звук не уходит');
    await dialog.getByTestId('voice-download').click();
    await expect(dialog.getByTestId('voice-progress')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Готово/ })).toBeVisible({ timeout: 300_000 });
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
