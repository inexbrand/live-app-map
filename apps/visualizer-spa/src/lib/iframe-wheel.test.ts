import { expect, test } from 'bun:test';
import { wheelToPage, type WheelInput } from './iframe-wheel';

const base: WheelInput = { clientX: 150, clientY: 300, deltaX: 0, deltaY: 120, deltaMode: 0, ctrlKey: false, metaKey: false };
const frame = { left: 100, top: 200, width: 195 };

test('точка под курсором — в px страницы (нода в масштабе 0.5)', () => {
  expect(wheelToPage(base, frame, 390)).toEqual({ lam: 'wheel', x: 100, y: 200, dx: 0, dy: 120 });
});

test('Ctrl/⌘+колесо — зум холста, странице ничего', () => {
  expect(wheelToPage({ ...base, ctrlKey: true }, frame, 390)).toBeNull();
  expect(wheelToPage({ ...base, metaKey: true }, frame, 390)).toBeNull();
});

test('колесо строками переводится в px', () => {
  expect(wheelToPage({ ...base, deltaY: 3, deltaMode: 1 }, frame, 390)?.dy).toBe(48);
});
