/**
 * Кнопка голоса как у пользователя: удержание — говорить, пока держите; короткий
 * клик — запись до второго клика; рядом — настройки модели.
 */
import { useDom } from '../../test/dom';
import { beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, within } from '@testing-library/react';
import type { VoiceCapture } from '../../lib/voice/use-voice-capture';
import { useVoiceStore } from '../../store/voice-store';
import { resetStores } from '../../test/fixtures';
import { VoiceButton } from './VoiceButton';

useDom();

beforeEach(() => resetStores());

/** Запись глазами кнопки: что она вызвала и идёт ли запись. */
function capture(recording: boolean, calls: string[]): VoiceCapture {
  return {
    recording,
    finishing: false,
    draft: '',
    level: 0,
    error: null,
    start: () => calls.push('start'),
    stop: () => calls.push('stop'),
    cancel: () => calls.push('cancel'),
  };
}

async function hold(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

describe('кнопка голоса', () => {
  test('удержание: начать при нажатии, остановить при отпускании', async () => {
    const calls: string[] = [];
    const r = render(<VoiceButton capture={capture(false, calls)} />);
    const btn = within(r.container).getByTestId('voice-button');
    expect(btn.getAttribute('aria-label')).toBe('Говорить (удерживайте)');
    fireEvent.pointerDown(btn, { pointerId: 1 });
    await hold(320);
    fireEvent.pointerUp(btn, { pointerId: 1 });
    expect(calls).toEqual(['start', 'stop']);
    fireEvent.pointerUp(btn, { pointerId: 1 });
    expect(calls).toEqual(['start', 'stop']);
  });

  test('короткий клик — запись до второго нажатия', () => {
    const calls: string[] = [];
    const r = render(<VoiceButton capture={capture(false, calls)} />);
    const btn = within(r.container).getByTestId('voice-button');
    fireEvent.pointerDown(btn, { pointerId: 1 });
    fireEvent.pointerUp(btn, { pointerId: 1 });
    expect(calls).toEqual(['start']);
    r.rerender(<VoiceButton capture={capture(true, calls)} />);
    expect(btn.getAttribute('aria-label')).toBe('Остановить запись');
    fireEvent.pointerDown(btn, { pointerId: 1 });
    expect(calls).toEqual(['start', 'stop']);
  });

  test('настройки модели открывают окно; при загрузке — подсказка', () => {
    const r = render(<VoiceButton capture={capture(false, [])} />);
    const ui = within(r.container);
    expect(ui.getByRole('button', { name: 'Модель распознавания' }).getAttribute('title')).toBe('Модель распознавания: язык, размер, удалить');
    act(() => useVoiceStore.setState({ phase: 'downloading' }));
    expect(ui.getByRole('button', { name: 'Модель распознавания' }).getAttribute('title')).toBe('Модель загружается…');
    act(() => useVoiceStore.setState({ phase: 'idle' }));
    fireEvent.click(ui.getByRole('button', { name: 'Модель распознавания' }));
    expect(useVoiceStore.getState().dialog).toBe(true);
  });
});
