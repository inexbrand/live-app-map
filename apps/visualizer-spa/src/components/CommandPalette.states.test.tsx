/**
 * Палитра поиска — состояния списка: выбранная строка и её id у поля,
 * стрелки упираются в края, наведение выбирает, новый запрос сбрасывает выбор,
 * заголовок группы — один на группу, подсказка действия — клавишей.
 */
import { useDom } from '../test/dom';
import { beforeEach, expect, test } from 'bun:test';
import { act, fireEvent, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUiStore } from '../store/ui-store';
import { openMap, resetStores } from '../test/fixtures';
import { CommandPalette } from './CommandPalette';

useDom();

beforeEach(resetStores);

function palette() {
  openMap('korbor-miniapp');
  const r = render(<CommandPalette />);
  act(() => useUiStore.getState().setPalette(true));
  const box = within(r.container);
  const input = box.getByTestId('palette-input');
  const rows = () => box.getAllByTestId('palette-row');
  const selected = () => rows().map((b, i) => (b.getAttribute('aria-selected') === 'true' ? i : -1)).filter((i) => i >= 0);
  const key = (k: string, times = 1) => {
    for (let i = 0; i < times; i++) {
      fireEvent.keyDown(input, { key: k });
    }
  };
  return { box, input, rows, selected, key };
}

test('стрелки: вниз до последней строки и не дальше, вверх до первой; id выбранной — у поля', () => {
  const p = palette();
  const n = p.rows().length;
  expect(n).toBeGreaterThan(2);
  expect(p.selected()).toEqual([0]);
  expect(p.input.getAttribute('aria-activedescendant')).toBe('palette-row-0');
  p.key('ArrowDown');
  expect(p.selected()).toEqual([1]);
  expect(p.rows()[1]?.className).toBe('palette__row palette__row--on');
  expect(p.rows()[0]?.className).toBe('palette__row');
  p.key('ArrowDown', n + 3);
  expect(p.selected()).toEqual([n - 1]);
  expect(p.input.getAttribute('aria-activedescendant')).toBe(`palette-row-${n - 1}`);
  p.key('ArrowUp', n + 3);
  expect(p.selected()).toEqual([0]);
});

test('наведение выбирает строку; новый запрос возвращает выбор к первой', async () => {
  const p = palette();
  const third = p.rows()[2];
  if (third === undefined) {
    throw new Error('мало строк');
  }
  fireEvent.mouseMove(third);
  expect(p.selected()).toEqual([2]);
  await userEvent.setup({ document }).type(p.input, 'a');
  expect(p.selected()).toEqual([0]);
});

test('заголовок группы — перед первой строкой группы; подсказка действия — клавишей, результата — текстом', async () => {
  const p = palette();
  await userEvent.setup({ document }).type(p.input, 'a');
  const items = p.box.getAllByRole('presentation');
  const groups = items.map((li) => li.querySelector('.palette__group')?.textContent ?? null);
  const kinds = items.map((li) => li.querySelector('[data-testid="palette-row"]')?.getAttribute('data-kind'));
  expect(kinds.length).toBeGreaterThan(3);
  expect(groups.map((g) => g !== null)).toEqual(kinds.map((k, i) => i === 0 || kinds[i - 1] !== k));
  expect(groups.filter((g) => g === 'Действия')).toHaveLength(1);
  const hints = items.map((li) => `${li.querySelector('[data-testid="palette-row"]')?.getAttribute('data-kind') === 'action'}:${li.querySelector('.palette__kbd, .palette__hint')?.className}`);
  expect(new Set(hints)).toEqual(new Set(['true:palette__kbd', 'false:palette__hint']));
  expect(p.box.queryByText(/Ничего не нашлось/)).toBeNull();
});

test('без запроса — только действия, и это не «ничего не нашлось»', () => {
  const p = palette();
  expect(p.rows().every((b) => b.getAttribute('data-kind') === 'action')).toBe(true);
  expect(p.box.queryByText(/Ничего не нашлось/)).toBeNull();
});
