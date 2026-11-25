/**
 * Адаптив карты в настройках.
 */
import { describe, expect, test } from 'bun:test';
import { mapAdaptive } from './map-adaptive';

describe('адаптив карты', () => {
  test('без layout — 390×844 fixed, пресет w390', () => {
    expect(mapAdaptive(undefined, [])).toEqual({ w: 390, h: 844, mode: 'fixed', presetId: 'w390' });
  });

  test('окно устройства важнее ширины и высоты layout; пресет по размеру', () => {
    const a = mapAdaptive({ defaultWidth: 360, defaultHeight: 800, defaultDeviceViewport: { width: 1280, height: 800, heightMode: 'auto' } }, [{ viewport: { width: 1440, height: 900 } }]);
    expect(a).toMatchObject({ w: 1280, h: 800, mode: 'auto' });
    expect(a.presetId).toBe('w1280');
  });

  test('ширина и высота layout, если окна нет; размера нет среди пресетов — ничего не выбрано (а не 390)', () => {
    expect(mapAdaptive({ defaultWidth: 777, defaultHeight: 555, defaultHeightMode: 'auto' }, [])).toEqual({ w: 777, h: 555, mode: 'auto', presetId: '' });
  });

  test('без окна в layout — самый частый размер экранов карты', () => {
    const nodes = [{ viewport: { width: 1440, height: 900 } }, { viewport: { width: 1440, height: 900 } }, { viewport: { width: 390, height: 844 } }, {}];
    expect(mapAdaptive(undefined, nodes)).toMatchObject({ w: 1440, h: 900, presetId: 'w1440' });
  });
});
