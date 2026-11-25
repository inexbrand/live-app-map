/**
 * Очередь перезапусков: не накладываются, правки во время ожидания сливаются в один.
 */
import { expect, test } from 'bun:test';
import { enqueueRestart } from './serial-restart-plugin';

test('перезапуски идут по очереди; ожидающие правки сливаются в один перезапуск', async () => {
  const log: string[] = [];
  let active = 0;
  let n = 0;
  const run = async (): Promise<void> => {
    const id = ++n;
    active++;
    log.push(`start ${id} active=${active}`);
    await Bun.sleep(30);
    active--;
    log.push(`end ${id}`);
  };
  const all = [enqueueRestart(run), enqueueRestart(run), enqueueRestart(run), enqueueRestart(run)];
  await Promise.all(all);
  expect(log).toEqual(['start 1 active=1', 'end 1', 'start 2 active=1', 'end 2']);
  // После очереди следующий перезапуск снова идёт сразу.
  await enqueueRestart(run);
  expect(log.slice(4)).toEqual(['start 3 active=1', 'end 3']);
});

test('упавший перезапуск не стопорит очередь', async () => {
  const done: string[] = [];
  const failed = enqueueRestart(async () => {
    await Bun.sleep(10);
    throw new Error('restart failed');
  });
  const next = enqueueRestart(async () => {
    done.push('второй');
  });
  await expect(failed).rejects.toThrow('restart failed');
  await next;
  expect(done).toEqual(['второй']);
});
