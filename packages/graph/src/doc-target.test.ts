/**
 * Разбор цели документа по виду.
 */
import { describe, expect, test } from 'bun:test';
import { matchDocTarget, type DocTarget } from './docs-query';

const label = (t: DocTarget): string =>
  matchDocTarget(t, {
    route: (r) => `R ${r.routeId}`,
    table: (r) => `T ${r.table}`,
    screen: (r) => `S ${r.nodeId}`,
    file: (r) => `F ${r.file}:${r.line ?? '-'}`,
  });

describe('matchDocTarget', () => {
  test('каждый вид уходит в свой обработчик со своими полями', () => {
    expect(label({ kind: 'route', routeId: 'r1' })).toBe('R r1');
    expect(label({ kind: 'table', table: 'users' })).toBe('T users');
    expect(label({ kind: 'screen', nodeId: 'n1' })).toBe('S n1');
    expect(label({ kind: 'file', file: 'a.ts', line: 3 })).toBe('F a.ts:3');
    expect(label({ kind: 'file', file: 'a.ts' })).toBe('F a.ts:-');
  });
});
