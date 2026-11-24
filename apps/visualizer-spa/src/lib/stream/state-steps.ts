/**
 * Шаги состояния экрана (LamStep из sdk): браузер выполняет их после загрузки
 * страницы — и трансляция, и снимок шлюза; кадр готовности — только после шагов.
 * Модуль без зависимостей от DOM карты: работает в dev-сервере.
 */
import type { AppMapStateStep } from '@live-app-map/schema';

/** Что нужно от страницы (Playwright Page подходит). */
export type StepsPage = {
  click(selector: string, opts: { timeout: number }): Promise<void>;
  fill(selector: string, value: string, opts: { timeout: number }): Promise<void>;
  waitForSelector(selector: string, opts: { timeout: number; state: 'visible' }): Promise<unknown>;
  readonly keyboard: { press(key: string): Promise<void> };
  readonly mouse: { wheel(dx: number, dy: number): Promise<void> };
  waitForTimeout(ms: number): Promise<void>;
};

/** Итог шагов: null — все выполнены, иначе «шаг N не выполнен: …». */
export type StepsResult = string | null;

/** Сколько ждать элемент шага, мс. */
export const STEP_TIMEOUT_MS = 5000;
/** Пауза после шагов: анимация модалки, отрисовка. */
const AFTER_STEPS_MS = 400;
/** Длина текста ошибки шага на узле. */
const ERROR_MAX = 160;

/** Выполнить один шаг. */
async function runStep(page: StepsPage, step: AppMapStateStep): Promise<void> {
  if ('click' in step) {
    await page.click(step.click, { timeout: STEP_TIMEOUT_MS });
  } else if ('fill' in step) {
    await page.fill(step.fill, step.value, { timeout: STEP_TIMEOUT_MS });
  } else if ('press' in step) {
    await page.keyboard.press(step.press);
  } else if ('waitFor' in step) {
    await page.waitForSelector(step.waitFor, { timeout: STEP_TIMEOUT_MS, state: 'visible' });
  } else {
    await page.mouse.wheel(0, step.scroll);
  }
}

/** Первая строка сообщения Playwright без служебного хвоста; таймаут — по-русски. */
function shortError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/Timeout \d+ms exceeded/.test(raw)) {
    return `элемент не найден за ${STEP_TIMEOUT_MS / 1000} с`;
  }
  const line = raw.split('\n').find((l) => l.trim() !== '') ?? raw;
  return line.trim().slice(0, ERROR_MAX);
}

/** Подпись шага для ошибки: действие и селектор. */
export function describeStep(step: AppMapStateStep): string {
  if ('click' in step) {
    return `клик ${step.click}`;
  }
  if ('fill' in step) {
    return `ввод в ${step.fill}`;
  }
  if ('press' in step) {
    return `клавиша ${step.press}`;
  }
  if ('waitFor' in step) {
    return `ожидание ${step.waitFor}`;
  }
  return `прокрутка ${step.scroll}`;
}

/**
 * Выполнить шаги по порядку; на первом сбое остановиться.
 *
 * @param page - страница после загрузки
 * @param steps - шаги состояния
 * @returns null — все выполнены, иначе «шаг N не выполнен: <шаг> — <причина>»
 */
export async function runStateSteps(page: StepsPage, steps: readonly AppMapStateStep[]): Promise<StepsResult> {
  for (const [i, step] of steps.entries()) {
    try {
      await runStep(page, step);
    } catch (err) {
      return `шаг ${i + 1} не выполнен: ${describeStep(step)} — ${shortError(err)}`;
    }
  }
  if (steps.length > 0) {
    await page.waitForTimeout(AFTER_STEPS_MS);
  }
  return null;
}
