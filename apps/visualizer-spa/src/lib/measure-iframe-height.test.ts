/**
 * Замер высоты iframe: same-origin, cross-origin, пустой документ, runaway.
 */
import { describe, expect, test } from 'bun:test';
import { MAX_CONTENT_HEIGHT } from './viewport';
import { measureIframeContentHeight, type MeasurableFrame } from './measure-iframe-height';

function frame(html: number, bodyScroll: number, bodyOffset: number): MeasurableFrame {
  return {
    contentDocument: {
      documentElement: { offsetHeight: html },
      body: { scrollHeight: bodyScroll, offsetHeight: bodyOffset },
    },
  };
}

describe('measureIframeContentHeight', () => {
  test('берёт наибольшую высоту коробок html/body и округляет вверх', () => {
    expect(measureIframeContentHeight(frame(1500.2, 1400, 1300))).toBe(1501);
    expect(measureIframeContentHeight(frame(900, 2400, 900))).toBe(2400);
  });

  test('контент ниже кадра даёт меньшую высоту (нода может сжаться)', () => {
    // iframe 844, страница 300 → 300, а не 844
    expect(measureIframeContentHeight(frame(300, 300, 300))).toBe(300);
  });

  test('cross-origin: contentDocument null или SecurityError → null', () => {
    expect(measureIframeContentHeight({ contentDocument: null })).toBeNull();
    const throwing: MeasurableFrame = {
      get contentDocument(): MeasurableFrame['contentDocument'] {
        throw new Error('SecurityError');
      },
    };
    expect(measureIframeContentHeight(throwing)).toBeNull();
    expect(measureIframeContentHeight(null)).toBeNull();
  });

  test('пустой документ (нет body или высота < 120) → null', () => {
    expect(measureIframeContentHeight({ contentDocument: { documentElement: null, body: null } })).toBeNull();
    expect(measureIframeContentHeight(frame(40, 40, 40))).toBeNull();
  });

  test('runaway-высота ограничена MAX_CONTENT_HEIGHT', () => {
    expect(measureIframeContentHeight(frame(10, 9_000_000, 10))).toBe(MAX_CONTENT_HEIGHT);
  });
});
