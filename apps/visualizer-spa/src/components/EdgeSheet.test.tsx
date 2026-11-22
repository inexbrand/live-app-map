import { useDom } from '../test/dom';
import { describe, expect, test } from 'bun:test';
import { fireEvent, render, within } from '@testing-library/react';
import { EdgeSheet } from './EdgeSheet';

useDom();

describe('EdgeSheet', () => {
  test('закрытый лист ничего не показывает', () => {
    const { container } = render(<EdgeSheet open={false} title="Т" onClose={() => {}}>тело</EdgeSheet>);
    expect(container.innerHTML).toBe('');
  });

  test('открытый: заголовок, описание, сторона; закрыть — фоном и кнопкой', () => {
    let closed = 0;
    const { container } = render(
      <EdgeSheet open title="Настройки" description="Лимиты" side="right" onClose={() => { closed += 1; }}>тело</EdgeSheet>,
    );
    const ui = within(container);
    const dialog = ui.getByRole('dialog', { name: 'Настройки' });
    expect(dialog.className).toContain('edge-sheet--right');
    expect(ui.getByText('Лимиты')).toBeTruthy();
    expect(ui.getByText('тело')).toBeTruthy();
    fireEvent.click(ui.getByLabelText('Закрыть'));
    fireEvent.click(ui.getByLabelText('Закрыть панель'));
    expect(closed).toBe(2);
  });

  test('без описания и стороны — по центру, без абзаца описания', () => {
    const { container } = render(<EdgeSheet open title="Т" onClose={() => {}}>x</EdgeSheet>);
    expect(container.querySelector('.edge-sheet--center')).not.toBeNull();
    expect(container.querySelector('.edge-sheet__desc')).toBeNull();
  });
});
