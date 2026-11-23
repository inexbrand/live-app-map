/**
 * Списки shadcn Select (Base UI) в DOM-тестах: открыть кнопку списка, выбрать пункт, прочитать пункты.
 * Пункты живут во всплывающем слое (портал в body), поэтому ищутся по всему документу.
 */
import { expect } from 'bun:test';
import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Открыть список и выбрать пункт по подписи.
 *
 * @param trigger - кнопка списка (role combobox)
 * @param option - подпись пункта
 */
export async function pickOption(trigger: HTMLElement, option: string): Promise<void> {
  const user = userEvent.setup({ document });
  await user.click(trigger);
  await user.click(await within(document.body).findByRole('option', { name: option }));
  await waitFor(() => expect(within(document.body).queryByRole('listbox')).toBeNull());
}

/**
 * Пункты списка: открыть, прочитать подписи и признак недоступности, закрыть клавишей Esc.
 *
 * @param trigger - кнопка списка (role combobox)
 */
export async function listOptions(trigger: HTMLElement): Promise<ReadonlyArray<{ readonly label: string; readonly disabled: boolean }>> {
  const user = userEvent.setup({ document });
  await user.click(trigger);
  const options = await within(document.body).findAllByRole('option');
  const result = options.map((o) => ({ label: o.textContent ?? '', disabled: o.getAttribute('aria-disabled') === 'true' || o.hasAttribute('data-disabled') }));
  await user.keyboard('{Escape}');
  return result;
}
