import { describe, expect, test } from 'bun:test';
import { SnapshotSlots } from './snapshot-slots';

describe('очередь загрузки снимков в браузере', () => {
  test('не больше limit одновременно; освобождённое место — следующему по очереди', () => {
    const slots = new SnapshotSlots(2);
    const got: string[] = [];
    const a = slots.take(() => got.push('a'));
    const b = slots.take(() => got.push('b'));
    const c = slots.take(() => got.push('c'));
    const d = slots.take(() => got.push('d'));
    expect(got).toEqual(['a', 'b']);
    a();
    expect(got).toEqual(['a', 'b', 'c']);
    // Ушедший из очереди (размонтирован) место не получит
    d();
    b();
    expect(got).toEqual(['a', 'b', 'c']);
    c();
    expect(slots.busy).toBe(0);
  });

  test('повторное освобождение не отдаёт место дважды', () => {
    const slots = new SnapshotSlots(1);
    const got: string[] = [];
    const a = slots.take(() => got.push('a'));
    slots.take(() => got.push('b'));
    slots.take(() => got.push('c'));
    a();
    a();
    expect(got).toEqual(['a', 'b']);
    expect(slots.busy).toBe(1);
  });
});
