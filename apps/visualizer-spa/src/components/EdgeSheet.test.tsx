import { useDom } from '../test/dom';
import { describe, expect, test } from 'bun:test';
import { fireEvent, render, within } from '@testing-library/react';
import { EdgeSheet } from './EdgeSheet';

useDom();

describe('EdgeSheet', () => {
  test('закрытый лист ничего не показывает', () => {
    render(<EdgeSheet open={false} title="Т" onClose={() => {}}>тело</EdgeSheet>);
    expect(within(document.body).queryByRole('dialog')).toBeNull();
  });

  test('открытый лист справа: заголовок, описание, тело; крестик закрывает', () => {
    let closed = 0;
    render(
      <EdgeSheet open title="Настройки" description="Лимиты" side="right" onClose={() => { closed += 1; }}>тело</EdgeSheet>,
    );
    const ui = within(document.body);
    const dialog = ui.getByRole('dialog', { name: 'Настройки' });
    expect(dialog.getAttribute('data-side')).toBe('right');
    expect(within(dialog).getByText('Лимиты')).toBeTruthy();
    expect(within(dialog).getByText('тело')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть' }));
    expect(closed).toBe(1);
  });

  test('без стороны — окно по центру, без абзаца описания', () => {
    render(<EdgeSheet open title="Т" onClose={() => {}}>x</EdgeSheet>);
    const dialog = within(document.body).getByRole('dialog', { name: 'Т' });
    expect(dialog.getAttribute('data-slot')).toBe('dialog-content');
    expect(dialog.querySelector('[data-slot="dialog-description"]')).toBeNull();
  });
});
