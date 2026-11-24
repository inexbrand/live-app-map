/**
 * Сбой запуска браузера снимков не должен ронять dev-сервер.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SnapshotService, type SnapshotBrowser } from './snapshot-service';

describe('SnapshotService: браузер не запустился', () => {
  test('ошибка уходит запросу, close не бросает, следующий запрос запускает браузер заново', async () => {
    let launches = 0;
    const launch = (): Promise<SnapshotBrowser> => {
      launches++;
      return Promise.reject(new Error('нет браузера'));
    };
    const service = new SnapshotService({ dir: mkdtempSync(path.join(tmpdir(), 'lam-snap-fail-')), launch, idleCloseMs: 10 });
    const req = { url: 'http://127.0.0.1:9/', width: 390, height: 300 };

    await expect(service.get(req)).rejects.toThrow('нет браузера');
    await expect(service.close()).resolves.toBeUndefined();
    await expect(service.get(req)).rejects.toThrow('нет браузера');
    expect(launches).toBe(2);
  });
});
