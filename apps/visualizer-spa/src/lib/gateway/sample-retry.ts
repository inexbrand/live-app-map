/**
 * Учёт запросов списков для параметров экранов (sample-ids): что в полёте, что
 * прочитано, что упало и когда его можно повторить. Без таймеров — время передаётся.
 */

/** Паузы перед повторами неудачного запроса; после последней — не повторяем. */
export const SAMPLE_RETRY_DELAYS_MS: readonly number[] = [3_000, 15_000, 60_000];

/** Ключ: в полёте или упал (с числом прошлых неудач), прочитан. */
type Entry =
  | { readonly kind: 'pending'; readonly failures: number }
  | { readonly kind: 'done' }
  | { readonly kind: 'failed'; readonly failures: number; readonly retryAt: number | null };

/** Журнал запросов по ключам «профиль|список». */
export class SampleRequestLog {
  private readonly entries = new Map<string, Entry>();

  /**
   * Ключи, которые можно запросить сейчас, — помечаются «в полёте».
   *
   * @param keys - нужные ключи
   * @param now - время, мс
   * @returns ключи для запроса
   */
  take(keys: readonly string[], now: number): string[] {
    return keys.filter((k) => {
      const e = this.entries.get(k);
      const ready = e === undefined || (e.kind === 'failed' && e.retryAt !== null && now >= e.retryAt);
      if (ready) {
        this.entries.set(k, { kind: 'pending', failures: e?.kind === 'failed' ? e.failures : 0 });
      }
      return ready;
    });
  }

  /**
   * Запрос прочитан (пустое значение — тоже ответ, а не сбой).
   *
   * @param keys - ключи
   */
  succeeded(keys: readonly string[]): void {
    keys.forEach((k) => this.entries.set(k, { kind: 'done' }));
  }

  /**
   * Запрос упал.
   *
   * @param keys - ключи одного запроса
   * @param now - время, мс
   * @returns пауза до повтора, мс, или null — попытки кончились
   */
  failed(keys: readonly string[], now: number): number | null {
    let delay: number | null = null;
    keys.forEach((k) => {
      const e = this.entries.get(k);
      const failures = (e?.kind === 'pending' ? e.failures : 0) + 1;
      const d = SAMPLE_RETRY_DELAYS_MS[failures - 1];
      this.entries.set(k, { kind: 'failed', failures, retryAt: d === undefined ? null : now + d });
      delay = d ?? null;
    });
    return delay;
  }
}
