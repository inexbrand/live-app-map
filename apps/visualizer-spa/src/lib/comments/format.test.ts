/**
 * Подписи и раскладка замечаний.
 */
import { describe, expect, test } from 'bun:test';
import { commentsLabel, composerPosition, timeAgo } from './format';

describe('формат замечаний', () => {
  const now = new Date('2026-11-21T12:00:00.000Z');
  test('относительное время', () => {
    expect(timeAgo('2026-11-21T11:59:30.000Z', now)).toBe('только что');
    expect(timeAgo('2026-11-21T11:55:00.000Z', now)).toBe('5 мин назад');
    expect(timeAgo('2026-11-21T09:00:00.000Z', now)).toBe('3 ч назад');
    expect(timeAgo('2026-11-18T09:00:00.000Z', now)).toMatch(/18/);
  });

  test('поле справа от элемента, у правого края — слева, у узкого окна — под элементом', () => {
    const size = { width: 360, height: 240 };
    expect(composerPosition({ x: 100, y: 100, width: 80, height: 40 }, { width: 1400, height: 900 }, size)).toEqual({ left: 192, top: 100 });
    expect(composerPosition({ x: 1200, y: 100, width: 80, height: 40 }, { width: 1400, height: 900 }, size)).toEqual({ left: 828, top: 100 });
    expect(composerPosition({ x: 20, y: 100, width: 360, height: 40 }, { width: 400, height: 900 }, size)).toEqual({ left: 20, top: 152 });
    expect(composerPosition({ x: 100, y: 850, width: 80, height: 40 }, { width: 1400, height: 900 }, size)).toEqual({ left: 192, top: 648 });
  });

  test('склонение', () => {
    expect([1, 2, 5, 11, 12, 21, 24].map(commentsLabel)).toEqual(['1 замечание', '2 замечания', '5 замечаний', '11 замечаний', '12 замечаний', '21 замечание', '24 замечания']);
  });
});
