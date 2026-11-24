import { useDom } from '../test/dom';
import { describe, expect, test } from 'bun:test';
// Хуки очистки testing-library ставятся при импорте, вне теста
import '@testing-library/react';
import { ZOOM_SETTLE_MS, zoomHandlers } from './AppMapCanvas';

useDom();

describe('движение камеры', () => {
  test('зум помечает хост, пауза после него снимает метку; панорама не помечает', async () => {
    const host = document.createElement('div');
    const z = zoomHandlers({ current: host });
    z.onMoveStart(null, { zoom: 1 });
    z.onMove(null, { zoom: 1 });
    expect(host.classList.contains('flow-host--zooming')).toBe(false);
    z.onMove(null, { zoom: 1.2 });
    expect(host.classList.contains('flow-host--zooming')).toBe(true);
    expect(host.style.getPropertyValue('--lam-zoom')).toBe('1.2');
    z.onMoveEnd();
    expect(host.classList.contains('flow-host--zooming')).toBe(true);
    await Bun.sleep(ZOOM_SETTLE_MS + 30);
    expect(host.classList.contains('flow-host--zooming')).toBe(false);
  });
});
