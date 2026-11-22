/**
 * Размеры окон через store: override ноды, измеренная высота, адаптив и пресеты карты.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { useAppStore } from '../app-store';
import { openMap, resetStores } from '../../test/fixtures';

beforeEach(() => resetStores());

function firstPage(): string {
  const id = useAppStore.getState().document?.nodes.find((n) => n.kind === 'page')?.id;
  if (id === undefined) {
    throw new Error('нет экрана');
  }
  return id;
}

describe('размеры окон', () => {
  test('без карты адаптив и пресет — подсказка в toast', () => {
    useAppStore.getState().setMapViewportPreset('w390');
    expect(useAppStore.getState().toast).toBe('Нет загруженной карты');
    useAppStore.setState({ toast: null });
    useAppStore.getState().setMapDeviceViewport({ width: 400, height: 800 });
    expect(useAppStore.getState().toast).toBe('Нет загруженной карты');
  });

  test('неизвестный пресет — toast с его id; известный — адаптив карты', () => {
    openMap('korbor-miniapp');
    useAppStore.getState().setMapViewportPreset('нет-такого');
    expect(useAppStore.getState().toast).toBe('Пресет «нет-такого» не найден');
    useAppStore.getState().setMapViewportPreset('w390');
    expect(useAppStore.getState().toast).toStartWith('Адаптив карты: 390×');
  });

  test('override ноды ставится и сбрасывается; без override — размер из карты', () => {
    openMap('korbor-miniapp');
    const id = firstPage();
    const fromMap = useAppStore.getState().getNodeViewport(id);
    useAppStore.getState().setNodeViewport(id, { width: 500, height: 900, label: 'планшет' });
    expect(useAppStore.getState().getNodeViewport(id)).toMatchObject({ width: 500, height: 900, label: 'планшет' });
    expect(useAppStore.getState().logs.at(-1)?.message).toBe('Размер окна 500×900 (планшет)');
    useAppStore.getState().setNodeViewport(id, null);
    expect(useAppStore.getState().getNodeViewport(id)).toEqual(fromMap);
    expect(useAppStore.getState().logs.at(-1)?.message).toBe('Размер окна сброшен к appmap');
  });

  test('высота контента: мелкая и почти та же — не пишется, новая — округляется', () => {
    openMap('korbor-miniapp');
    const id = firstPage();
    const st = () => useAppStore.getState();
    st().setContentHeight(id, 80);
    st().setContentHeight(id, Number.NaN);
    expect(st().contentHeights.has(id)).toBe(false);
    st().setContentHeight(id, 600.4);
    expect(st().contentHeights.get(id)).toBe(600);
    const before = st().contentHeights;
    st().setContentHeight(id, 603);
    expect(st().contentHeights).toBe(before);
    st().setContentHeight(id, 700);
    expect(st().contentHeights.get(id)).toBe(700);
  });
});
