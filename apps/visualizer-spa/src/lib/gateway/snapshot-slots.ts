/**
 * Очередь загрузки снимков (/__lam_snapshot) в браузере.
 *
 * Снимок отвечает долго (сервер снимает по 2 за раз), а браузер держит к одному
 * origin не больше 6 соединений HTTP/1.1. Сотня картинок замороженных экранов
 * занимала их все, и запросы приложения (POST замечания, состояние для агента)
 * ждали минутами. Картинка получает адрес только со свободным местом.
 */
import { useEffect, useState } from 'react';
import { SNAPSHOT_PATH } from './snapshot-url';

/** Сколько снимков грузится одновременно: столько снимает сервер; остальные соединения — приложению. */
export const SNAPSHOT_SLOTS = 2;

/** Места загрузки: занять (колбэк — когда место дали), освободить — возвращённой функцией. */
export class SnapshotSlots {
  private used = 0;
  private readonly queue: Array<{ readonly run: () => void; dropped: boolean }> = [];

  constructor(private readonly limit: number) {}

  /** Занятых мест. */
  get busy(): number {
    return this.used;
  }

  /**
   * Встать в очередь за местом.
   *
   * @param start - зовётся, когда место дано
   * @returns освобождение места (или выход из очереди); повторный вызов ничего не делает
   */
  take(start: () => void): () => void {
    let state: 'waiting' | 'running' | 'released' = 'waiting';
    const entry = {
      dropped: false,
      run: (): void => {
        state = 'running';
        this.used++;
        start();
      },
    };
    if (this.used < this.limit) {
      entry.run();
    } else {
      this.queue.push(entry);
    }
    return () => {
      if (state === 'running') {
        this.used--;
        this.next();
      } else if (state === 'waiting') {
        entry.dropped = true;
      }
      state = 'released';
    };
  }

  private next(): void {
    while (this.used < this.limit && this.queue.length > 0) {
      const e = this.queue.shift();
      if (e !== undefined && !e.dropped) {
        e.run();
      }
    }
  }
}

const shared = new SnapshotSlots(SNAPSHOT_SLOTS);

/**
 * Адрес картинки с очередью: снимок шлюза — после свободного места, прочее (кадр blob:) — сразу.
 *
 * @param src - адрес картинки
 * @returns адрес для img (null — ждёт места) и onDone — звать на load/error
 */
export function useSnapshotSlot(src: string): { readonly src: string | null; readonly onDone: () => void } {
  const queued = src.startsWith(SNAPSHOT_PATH);
  const [ready, setReady] = useState<{ readonly src: string; readonly release: () => void } | null>(null);
  useEffect(() => {
    if (!queued) {
      return;
    }
    let release: () => void = () => undefined;
    release = shared.take(() => setReady({ src, release: () => release() }));
    return () => {
      release();
      setReady(null);
    };
  }, [src, queued]);
  if (!queued) {
    return { src, onDone: () => undefined };
  }
  return ready !== null && ready.src === src ? { src, onDone: ready.release } : { src: null, onDone: () => undefined };
}
