/**
 * Учёт запросов списков sample-ids: в полёте и прочитанное не запрашивается снова,
 * неудачное — повторяется после паузы, попыток не больше предела.
 */
import { describe, expect, test } from 'bun:test';
import { SAMPLE_RETRY_DELAYS_MS, SampleRequestLog } from './sample-retry';

describe('SampleRequestLog', () => {
  test('в полёте и прочитанные списки второй раз не берутся', () => {
    const log = new SampleRequestLog();
    expect(log.take(['a', 'b'], 0)).toEqual(['a', 'b']);
    expect(log.take(['a', 'c'], 1)).toEqual(['c']);
    log.succeeded(['a', 'b']);
    expect(log.take(['a', 'b'], 2)).toEqual([]);
  });

  test('неудача: пауза растёт, после паузы список снова берётся; после последней попытки — нет', () => {
    const log = new SampleRequestLog();
    let now = 0;
    for (const delay of SAMPLE_RETRY_DELAYS_MS) {
      expect(log.take(['a'], now)).toEqual(['a']);
      expect(log.failed(['a'], now)).toBe(delay);
      expect(log.take(['a'], now + delay - 1)).toEqual([]);
      now += delay;
    }
    expect(log.take(['a'], now)).toEqual(['a']);
    expect(log.failed(['a'], now)).toBeNull();
    expect(log.take(['a'], now + 10 * 60_000)).toEqual([]);
  });
});
