import { useDom } from '../test/dom';
import { describe, expect, test } from 'bun:test';
import { render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { OptionSelect } from './option-select';

function Harness(props: { readonly onPick: (v: string) => void }) {
  const [value, setValue] = useState('a');
  return (
    <OptionSelect
      aria-label="Буква"
      items={[{ value: 'a', label: 'Альфа' }, { value: 'b', label: 'Бета' }]}
      actions={[{ value: 'x', label: 'Сбросить' }]}
      value={value}
      onValueChange={(v) => {
        setValue(v);
        props.onPick(v);
      }}
    />
  );
}

useDom();

describe('OptionSelect', () => {
  test('кнопка показывает подпись выбранного, выбор пункта меняет значение', async () => {
    const picked: string[] = [];
    render(<Harness onPick={(v) => picked.push(v)} />);
    const screen = within(document.body);
    const trigger = screen.getByRole('combobox', { name: 'Буква' });
    expect(trigger.textContent).toContain('Альфа');
    const user = userEvent.setup({ document });
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'Бета' }));
    await waitFor(() => expect(trigger.textContent).toContain('Бета'));
    expect(picked).toEqual(['b']);
  });
});
