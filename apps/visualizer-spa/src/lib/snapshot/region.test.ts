/**
 * Геометрия выделения и перевод в пиксели кадра.
 */
import { describe, expect, test } from 'bun:test';
import { cropForFrame, isUsableSelection, rectFromPoints } from './region';

describe('rectFromPoints', () => {
  test('протяжка в любую сторону даёт тот же прямоугольник', () => {
    const r = { x: 10, y: 20, width: 90, height: 40 };
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 100, y: 60 })).toEqual(r);
    expect(rectFromPoints({ x: 100, y: 60 }, { x: 10, y: 20 })).toEqual(r);
    expect(rectFromPoints({ x: 100, y: 20 }, { x: 10, y: 60 })).toEqual(r);
  });
});

describe('isUsableSelection', () => {
  test('клик без протяжки — не выделение', () => {
    expect(isUsableSelection(rectFromPoints({ x: 5, y: 5 }, { x: 7, y: 30 }))).toBe(false);
    expect(isUsableSelection(rectFromPoints({ x: 5, y: 5 }, { x: 13, y: 13 }))).toBe(true);
  });
});

describe('cropForFrame', () => {
  test('retina: кадр вдвое больше окна', () => {
    expect(
      cropForFrame({ x: 10, y: 20, width: 100, height: 50 }, { width: 1280, height: 720 }, { width: 2560, height: 1440 }),
    ).toEqual({ sx: 20, sy: 40, sw: 200, sh: 100 });
  });

  test('область за краем обрезается по кадру', () => {
    expect(
      cropForFrame({ x: 1200, y: 700, width: 200, height: 100 }, { width: 1280, height: 720 }, { width: 1280, height: 720 }),
    ).toEqual({ sx: 1200, sy: 700, sw: 80, sh: 20 });
  });

  test('целиком вне кадра или пустые размеры → null', () => {
    expect(cropForFrame({ x: 2000, y: 0, width: 10, height: 10 }, { width: 1280, height: 720 }, { width: 1280, height: 720 })).toBeNull();
    expect(cropForFrame({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 720 }, { width: 1280, height: 720 })).toBeNull();
  });
});
