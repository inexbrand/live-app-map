/**
 * Переходы сессии снимка.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { useSnapshotStore } from './snapshot-store';

const rect = { x: 0, y: 0, width: 100, height: 100 };
const phase = (): string => useSnapshotStore.getState().session.phase;

describe('snapshot session', () => {
  beforeEach(() => {
    useSnapshotStore.getState().finish();
  });

  test('замечание: opening → selecting → capturing → idle', () => {
    const s = useSnapshotStore.getState();
    expect(s.request({ kind: 'feedback', pageId: 'p' })).toBe(true);
    expect(phase()).toBe('opening');
    s.opened();
    expect(phase()).toBe('selecting');
    s.beginCapture(rect);
    expect(useSnapshotStore.getState().session).toEqual({ phase: 'capturing', purpose: { kind: 'feedback', pageId: 'p' }, rect });
    s.finish();
    expect(phase()).toBe('idle');
  });

  test('агент: сначала ждём согласия пользователя', () => {
    const s = useSnapshotStore.getState();
    s.request({ kind: 'agent', requestId: 'r1', note: 'шапка' });
    expect(phase()).toBe('requested');
    s.opened(); // без согласия доступ не открывается
    expect(phase()).toBe('requested');
    s.accept();
    expect(phase()).toBe('opening');
  });

  test('вторая сессия поверх идущей не начинается', () => {
    const s = useSnapshotStore.getState();
    s.request({ kind: 'feedback', pageId: null });
    expect(s.request({ kind: 'agent', requestId: 'r1', note: null })).toBe(false);
    expect(useSnapshotStore.getState().session).toMatchObject({ purpose: { kind: 'feedback' } });
  });

  test('отмена работает до захвата и не рвёт идущий захват', () => {
    const s = useSnapshotStore.getState();
    s.request({ kind: 'agent', requestId: 'r1', note: null });
    s.cancel();
    expect(phase()).toBe('idle');
    s.request({ kind: 'feedback', pageId: null });
    s.opened();
    s.beginCapture(rect);
    s.cancel();
    expect(phase()).toBe('capturing');
  });

  test('beginCapture без выделения игнорируется', () => {
    useSnapshotStore.getState().beginCapture(rect);
    expect(phase()).toBe('idle');
  });
});
