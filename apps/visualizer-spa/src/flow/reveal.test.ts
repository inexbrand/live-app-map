/**
 * revealShift: нода уходит из-под панелей и не уезжает, если не мешают.
 */
import { describe, expect, test } from 'bun:test';
import { revealShift, type DockedPanel } from './reveal';

const leftPanel = { left: 12, top: 68, right: 392, bottom: 524 };
const rightPanel = { left: 1208, top: 68, right: 1588, bottom: 488 };
const toolbar = { left: 0, top: 0, right: 1600, bottom: 56 };
const panels: DockedPanel[] = [
  { rect: leftPanel, side: 'left' },
  { rect: rightPanel, side: 'right' },
  { rect: toolbar, side: 'top' },
];

describe('revealShift', () => {
  test('нода под левой панелью сдвигается вправо за её край', () => {
    expect(revealShift({ left: 56, top: 468, right: 267, bottom: 990 }, panels, 16)).toEqual({ dx: 392 + 16 - 56, dy: 0 });
  });

  test('нода под правой панелью сдвигается влево', () => {
    expect(revealShift({ left: 1100, top: 200, right: 1300, bottom: 700 }, panels, 16)).toEqual({ dx: 1208 - 16 - 1300, dy: 0 });
  });

  test('нода под шапкой опускается ниже неё', () => {
    expect(revealShift({ left: 600, top: 20, right: 800, bottom: 500 }, panels, 16)).toEqual({ dx: 0, dy: 56 + 16 - 20 });
  });

  test('шире просвета — к левому краю просвета', () => {
    expect(revealShift({ left: 300, top: 200, right: 1400, bottom: 900 }, panels, 16).dx).toBe(392 + 16 - 300);
  });

  test('панели не мешают — без сдвига', () => {
    expect(revealShift({ left: 500, top: 200, right: 900, bottom: 900 }, panels, 16)).toEqual({ dx: 0, dy: 0 });
  });
});