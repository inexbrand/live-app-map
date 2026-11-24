/**
 * Отложенная видимость не переносится на другую карту: замеры нод старой
 * карты (в т.ч. «нода ушла» при размонтировании) не трогают видимость новой.
 */
import { useDom } from '../test/dom';
import { beforeEach, describe, expect, test } from 'bun:test';
import { act, render } from '@testing-library/react';
import { useAppStore } from '../store/app-store';
import { openMap, resetStores } from '../test/fixtures';
import { AppMapCanvas } from './AppMapCanvas';
import { VISIBILITY_SETTLE_MS } from './page-node/use-node-visibility';

useDom();

beforeEach(() => resetStores());

describe('видимость после смены карты', () => {
  test('ушедшие ноды прошлой карты не снимают видимость той же ноды новой карты', async () => {
    openMap('korbor-miniapp');
    const first = render(<AppMapCanvas />);
    await act(async () => {
      await Bun.sleep(20);
    });
    first.unmount();
    const doc = openMap('korbor-miniapp');
    const id = doc.nodes.find((n) => n.kind === 'page')?.id ?? '';
    act(() => useAppStore.getState().setVisible(new Set([id])));
    await act(async () => {
      await Bun.sleep(VISIBILITY_SETTLE_MS + 50);
    });
    expect(useAppStore.getState().visiblePageIds.has(id)).toBe(true);
  });
});
