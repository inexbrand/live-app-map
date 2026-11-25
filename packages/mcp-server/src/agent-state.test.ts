/**
 * Канал агент ↔ визуализатор через файлы: состояние, просьба снимка, снимок.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  readLatestSnapshot,
  SNAPSHOT_REQUEST_TTL_MS,
  readPendingSnapshotRequest,
  readVisualizerState,
  saveSnapshot,
  writeSnapshotRequest,
  writeVisualizerState,
  type VisualizerState,
} from './agent-state';

/** 1×1 PNG. */
export const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'lam-agent-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const state: VisualizerState = {
  mapName: 'korbor-miniapp',
  baseUrl: 'https://vite.localhost:5175',
  mode: 'live',
  role: 'recruiter',
  pageCount: 12,
  selectedPage: { id: 'feed', title: 'Лента', path: '/feed', url: 'https://vite.localhost:5175/#/feed', stateName: null },
  updatedAt: '2026-11-20T10:00:00.000Z',
};

describe('visualizer state', () => {
  test('нет файла → null', () => {
    expect(readVisualizerState(dir)).toBeNull();
  });

  test('запись и чтение возвращают то же состояние', () => {
    writeVisualizerState(dir, state);
    expect(readVisualizerState(dir)).toEqual(state);
  });

  test('повреждённый файл → null, а не исключение', () => {
    writeVisualizerState(dir, state);
    const file = path.join(dir, 'agent', 'visualizer-state.json');
    // Синхронно: Bun.write без await дописывал файл уже после чтения — тест читал прежнее состояние.
    writeFileSync(file, '{broken');
    expect(readVisualizerState(dir)).toBeNull();
  });
});

describe('snapshot request → snapshot', () => {
  test('просьба висит, пока не придёт снимок с её id', () => {
    const req = writeSnapshotRequest(dir, 'кнопка обрезана');
    expect(readPendingSnapshotRequest(dir)).toEqual(req);

    // Снимок по другой просьбе не закрывает текущую
    saveSnapshot(dir, { requestId: 'other', pageId: null, dataUrl: PNG_1PX });
    expect(readPendingSnapshotRequest(dir)?.id).toBe(req.id);

    const rec = saveSnapshot(dir, { requestId: req.id, pageId: 'feed', dataUrl: PNG_1PX });
    expect(readPendingSnapshotRequest(dir)).toBeNull();
    expect(readLatestSnapshot(dir)).toEqual(rec);
    expect(existsSync(rec.file)).toBe(true);
    // Файл — настоящий PNG (сигнатура)
    expect([...readFileSync(rec.file).subarray(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
  });

  test('просроченная просьба не висит', () => {
    const t0 = new Date('2026-11-20T10:00:00.000Z');
    writeSnapshotRequest(dir, null, t0);
    expect(readPendingSnapshotRequest(dir, new Date(t0.getTime() + SNAPSHOT_REQUEST_TTL_MS))).not.toBeNull();
    expect(readPendingSnapshotRequest(dir, new Date(t0.getTime() + SNAPSHOT_REQUEST_TTL_MS + 1))).toBeNull();
  });

  test('пустой PNG отклоняется', () => {
    expect(() =>
      saveSnapshot(dir, { requestId: null, pageId: null, dataUrl: 'data:image/png;base64,' }),
    ).toThrow('пустой');
    expect(readLatestSnapshot(dir)).toBeNull();
  });
});
