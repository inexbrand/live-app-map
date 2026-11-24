/**
 * Голосовой ввод как у пользователя: окно модели (размер, выбор модели и языка,
 * скачивание с прогрессом, удаление, ошибки) и запись в поле замечания (⌥ и кнопка,
 * живой черновик, итоговый текст, отмена, нет микрофона).
 * Микрофон и воркер распознавания — стенд test/voice; dev-сервер моделей — подмена fetch.
 */
import { dumpDom, useDom } from '../../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import { disposeVoiceEngine } from '../../lib/voice/voice-engine';
import { useCommentsStore } from '../../store/comments-store';
import { useVoiceStore } from '../../store/voice-store';
import { jsonResponse, openMap, resetStores, stubFetch } from '../../test/fixtures';
import { installVoiceEnv, type VoiceEnv } from '../../test/voice';
import { useAppStore } from '../../store/app-store';
import { CommentPopover } from './CommentPopover';
import { VoiceModelDialog } from './VoiceModelDialog';

useDom();

let voice: VoiceEnv;
let net: ReturnType<typeof stubFetch>;
/** Ответ /__lam_models/size: размер модели и сколько уже на диске. */
let sizes: { bytes: number; bytesOnDisk: number } | 'down' = { bytes: 150_000_000, bytesOnDisk: 0 };

beforeEach(() => {
  resetStores();
  disposeVoiceEngine();
  localStorage.clear();
  voice = installVoiceEnv();
  sizes = { bytes: 150_000_000, bytesOnDisk: 0 };
  net = stubFetch((url, init) => {
    if (url.startsWith('/__lam_models/size')) {
      if (sizes === 'down') {
        throw new TypeError('сеть недоступна');
      }
      return jsonResponse(sizes);
    }
    if (url.startsWith('/__lam_models/hf/') && init?.method === 'DELETE') {
      return jsonResponse({ ok: true });
    }
    return undefined;
  });
});

afterEach(() => {
  disposeVoiceEngine();
  voice.restore();
  net.restore();
});

function dialog() {
  const r = render(<VoiceModelDialog />);
  return { ui: within(r.container), container: r.container, unmount: r.unmount };
}

describe('окно модели', () => {
  test('закрыто — ничего; открыто — размер, устройство, выбор модели и языка; Esc и фон закрывают', async () => {
    const { ui, container } = dialog();
    expect(ui.queryByTestId('voice-dialog')).toBeNull();
    act(() => useVoiceStore.getState().setDialog(true));
    expect(ui.getByTestId('voice-size').textContent).toBe('размер уточняется');
    await waitFor(() => expect(ui.getByTestId('voice-size').textContent).toBe('150 МБ'));
    expect(ui.getByText('процессор (WASM) — WebGPU в этом браузере недоступен')).toBeTruthy();
    expect(ui.getByTestId('voice-download').textContent).toBe('Скачать 150 МБ');
    dumpDom('voice-dialog', container);
    const radios = ui.getAllByRole('radio', { checked: false }).filter((r) => r.getAttribute('name') === 'voice-model');
    fireEvent.click(radios[0] ?? container);
    await waitFor(() => expect(useVoiceStore.getState().model).not.toBe('base'));
    expect(JSON.parse(localStorage.getItem('lam-voice') ?? '{}')).toMatchObject({ model: useVoiceStore.getState().model, language: 'ru' });
    fireEvent.click(ui.getByRole('radio', { name: 'English' }));
    expect(useVoiceStore.getState().language).toBe('en');
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(ui.queryByTestId('voice-dialog')).toBeNull();
    act(() => useVoiceStore.getState().setDialog(true));
    fireEvent.click(ui.getByTestId('voice-dialog'));
    expect(ui.queryByTestId('voice-dialog')).not.toBeNull();
    fireEvent.click(container.querySelector('.voice-dialog__backdrop') ?? container);
    expect(ui.queryByTestId('voice-dialog')).toBeNull();
  });

  test('скачать: прогресс, готово; модель есть — «Удалить модель» чистит кэш и диск', async () => {
    voice.whisper.stepMs = 150;
    const { ui, container } = dialog();
    act(() => useVoiceStore.getState().setDialog(true));
    await waitFor(() => expect(ui.getByTestId('voice-download').textContent).toBe('Скачать 150 МБ'));
    fireEvent.click(ui.getByTestId('voice-download'));
    await waitFor(() => expect(ui.getByTestId('voice-progress').textContent).toBe('1 МБ из 150 МБ'));
    await waitFor(() => expect(ui.getByTestId('voice-progress').textContent).toBe('1 МБ из 1 МБ'), { timeout: 2000 });
    await waitFor(() => expect(ui.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('20'));
    dumpDom('voice-progress', container);
    await waitFor(() => expect(ui.getByRole('button', { name: 'Готово — держите ⌥ и говорите' })).toBeTruthy(), { timeout: 2000 });
    expect(voice.requests[0]).toMatchObject({ type: 'load', device: 'wasm' });
    voice.cached.add(`${location.origin}/__lam_models/hf/${'repo'}/x`);
    const repo = voice.requests[0]?.type === 'load' ? voice.requests[0].repo : '';
    voice.cached.add(`${location.origin}/__lam_models/hf/${repo}/resolve/main/config.json`);
    fireEvent.click(ui.getByTestId('voice-remove'));
    await waitFor(() => expect(useVoiceStore.getState().present).toBe(false));
    expect([...voice.cached]).toEqual([`${location.origin}/__lam_models/hf/repo/x`]);
    expect(net.calls.some((c) => c.method === 'DELETE' && c.url === `/__lam_models/hf/${repo}`)).toBe(true);
    fireEvent.click(ui.getByRole('button', { name: 'Закрыть' }));
    expect(useVoiceStore.getState().dialog).toBe(false);
  });

  test('модель на диске — «Включить»; ошибка загрузки и падение воркера — сообщение', async () => {
    sizes = { bytes: 1_500_000_000, bytesOnDisk: 1_500_000_000 };
    voice.whisper.loadError = 'нет памяти';
    const { ui } = dialog();
    act(() => useVoiceStore.getState().setDialog(true));
    await waitFor(() => expect(ui.getByTestId('voice-download').textContent).toBe('Включить'));
    expect(ui.getByTestId('voice-size').textContent).toBe('1,5 ГБ');
    fireEvent.click(ui.getByTestId('voice-download'));
    await waitFor(() => expect(ui.getByRole('alert').textContent).toBe('нет памяти'));
    voice.whisper.crash = true;
    fireEvent.click(ui.getByTestId('voice-download'));
    await waitFor(() => expect(ui.getByRole('alert').textContent).toBe('воркер распознавания упал'));
  });

  test('устройство: WebGPU, если браузер дал адаптер; нет адаптера, ошибка или выбран процессор — WASM', async () => {
    const cases: [unknown, string | null, string][] = [
      [{ requestAdapter: async () => ({}) }, null, 'видеокарта (WebGPU)'],
      [{ requestAdapter: async () => null }, null, 'процессор (WASM) — WebGPU в этом браузере недоступен'],
      [{ requestAdapter: async () => { throw new Error('нет'); } }, null, 'процессор (WASM) — WebGPU в этом браузере недоступен'],
      [{ requestAdapter: 'не функция' }, null, 'процессор (WASM) — WebGPU в этом браузере недоступен'],
      [{ requestAdapter: async () => ({}) }, 'wasm', 'процессор (WASM) — WebGPU в этом браузере недоступен'],
    ];
    for (const [gpu, forced, text] of cases) {
      resetStores();
      if (forced === null) {
        localStorage.removeItem('lam-voice-device');
      } else {
        localStorage.setItem('lam-voice-device', forced);
      }
      Object.defineProperty(navigator, 'gpu', { configurable: true, value: gpu });
      const r = dialog();
      expect(r.ui.queryByText('проверяем видеокарту…')).toBeNull();
      act(() => useVoiceStore.getState().setDialog(true));
      expect(r.ui.getByText('проверяем видеокарту…')).toBeTruthy();
      await waitFor(() => expect(r.ui.getByText(text)).toBeTruthy());
      r.unmount();
    }
    Reflect.deleteProperty(navigator, 'gpu');
    localStorage.removeItem('lam-voice-device');
  });

  test('размер не узнать: из кэша браузера — есть; нет — «размер неизвестен»', async () => {
    sizes = 'down';
    const { ui } = dialog();
    act(() => useVoiceStore.getState().setDialog(true));
    await waitFor(() => expect(useVoiceStore.getState().error).toMatch(/^Размер модели неизвестен: /));
    expect(useVoiceStore.getState().present).toBe(false);
    expect(ui.getByTestId('voice-download').textContent).toBe('Скачать');
  });
});

describe('голос в поле замечания', () => {
  function composer() {
    openMap('korbor-miniapp');
    const page = useAppStore.getState().document?.nodes.find((n) => n.kind === 'page')?.id ?? '';
    act(() => {
      useAppStore.getState().selectPage(page);
      useCommentsStore.getState().openTarget({ anchor: { mapName: null, pageId: page, pageTitle: 'Главная', pageUrl: null, role: null, element: null }, frame: null, shot: null });
    });
    // Тело ноды на холсте: окно встаёт напротив него
    const body = document.createElement('div');
    body.setAttribute('data-lam-preview-body', '');
    body.setAttribute('data-page-id', page);
    document.body.append(body);
    const r = render(<CommentPopover />);
    const ui = within(r.container);
    const text = ui.getByLabelText('Что не так');
    if (!(text instanceof HTMLTextAreaElement)) {
      throw new Error('нет поля');
    }
    return { ui, text, container: r.container };
  }

  test('⌥: слушаю, живой черновик, итоговый текст в поле', async () => {
    sizes = { bytes: 1000, bytesOnDisk: 1000 };
    voice.whisper.texts = ['черновик фразы', 'кнопка не нажимается'];
    const { ui, text, container } = composer();
    fireEvent.keyDown(text, { key: 'Alt' });
    await waitFor(() => expect(ui.getByTestId('voice-draft').textContent).toBe('Слушаю…'), { timeout: 2000 });
    expect(ui.getByTestId('voice-button').getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(useVoiceStore.getState().phase).toBe('ready'));
    voice.speak(1);
    await waitFor(() => expect(ui.getByTestId('voice-draft').textContent).toBe('черновик фразы'), { timeout: 3000 });
    dumpDom('voice-recording', container);
    fireEvent.keyUp(text, { key: 'Alt' });
    await waitFor(() => expect(text.value).toBe('Кнопка не нажимается'));
    expect(ui.queryByTestId('voice-draft')).toBeNull();
    expect(voice.stoppedTracks()).toBe(1);
  });

  test('модели нет — окно модели вместо записи', async () => {
    const { ui } = composer();
    fireEvent.pointerDown(ui.getByTestId('voice-button'), { pointerId: 1 });
    await waitFor(() => expect(useVoiceStore.getState().dialog).toBe(true));
    expect(ui.queryByTestId('voice-draft')).toBeNull();
  });

  test('Esc во время записи — отмена; короткая запись — без текста; нет микрофона — ошибка', async () => {
    sizes = { bytes: 1000, bytesOnDisk: 1000 };
    const { ui, text } = composer();
    fireEvent.keyDown(text, { key: 'Alt' });
    await waitFor(() => expect(ui.queryByTestId('voice-draft')).not.toBeNull(), { timeout: 2000 });
    voice.speak(1);
    fireEvent.keyDown(text, { key: 'Escape' });
    await waitFor(() => expect(ui.queryByTestId('voice-draft')).toBeNull());
    expect(ui.queryByTestId('comment-popover')).not.toBeNull();
    expect(text.value).toBe('');
    fireEvent.keyDown(text, { key: 'Alt' });
    await waitFor(() => expect(ui.queryByTestId('voice-draft')).not.toBeNull(), { timeout: 2000 });
    voice.speak(0.1);
    fireEvent.keyUp(text, { key: 'Alt' });
    await waitFor(() => expect(ui.queryByTestId('voice-draft')).toBeNull());
    expect(text.value).toBe('');
    voice.denyMic = true;
    fireEvent.keyDown(text, { key: 'Alt' });
    await waitFor(() => expect(ui.getByRole('alert').textContent).toBe('Нет доступа к микрофону'), { timeout: 2000 });
  });

  test('распознавание упало — ошибка; отпустить до начала записи — запись сразу распознаётся', async () => {
    sizes = { bytes: 1000, bytesOnDisk: 1000 };
    voice.whisper.transcribeError = 'сбой распознавания';
    const { ui, text } = composer();
    fireEvent.pointerDown(ui.getByTestId('voice-button'), { pointerId: 1 });
    fireEvent.pointerUp(ui.getByTestId('voice-button'), { pointerId: 1 });
    await waitFor(() => expect(ui.getByTestId('voice-button').getAttribute('aria-pressed')).toBe('true'), { timeout: 2000 });
    await waitFor(() => expect(useVoiceStore.getState().phase).toBe('ready'));
    voice.speak(1);
    fireEvent.pointerDown(ui.getByTestId('voice-button'), { pointerId: 1 });
    await waitFor(() => expect(ui.getByRole('alert').textContent).toBe('сбой распознавания'));
    expect(text.value).toBe('');
  });
});
