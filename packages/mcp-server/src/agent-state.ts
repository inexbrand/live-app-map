/**
 * Состояние «что открыто в визуализаторе» и снимки экрана для агента.
 *
 * Канал — файлы в папке обмена, у каждого файла ровно один писатель:
 * - `agent/visualizer-state.json` — пишет только визуализатор (через dev-сервер);
 * - `agent/snapshot-request.json` — пишет только MCP-tool `request_snapshot`;
 * - `agent/snapshot-latest.json` и `agent/snapshots/*.png` — только визуализатор.
 * Запрос считается выполненным, когда `snapshot-latest.requestId` равен его id.
 */
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const selectedPageSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  path: z.string().nullable(),
  url: z.string().nullable(),
  stateName: z.string().nullable(),
});

/** Схема состояния визуализатора (граница: тело POST от браузера). */
export const visualizerStateSchema = z.object({
  mapName: z.string().nullable(),
  baseUrl: z.string().nullable(),
  mode: z.string(),
  role: z.string().nullable(),
  pageCount: z.number().int().nonnegative(),
  selectedPage: selectedPageSchema.nullable(),
  updatedAt: z.string().min(1),
});

/** Что пользователь сейчас видит в визуализаторе. */
export type VisualizerState = z.infer<typeof visualizerStateSchema>;

const snapshotRequestSchema = z.object({
  id: z.string().min(1),
  note: z.string().nullable(),
  requestedAt: z.string().min(1),
});

/** Просьба агента снять экран. */
export type SnapshotRequest = z.infer<typeof snapshotRequestSchema>;

const snapshotRecordSchema = z.object({
  requestId: z.string().nullable(),
  pageId: z.string().nullable(),
  file: z.string().min(1),
  capturedAt: z.string().min(1),
  bytes: z.number().int().positive(),
});

/** Сохранённый снимок экрана. */
export type SnapshotRecord = z.infer<typeof snapshotRecordSchema>;

/** Схема загрузки снимка из браузера. */
export const snapshotUploadSchema = z.object({
  requestId: z.string().min(1).nullable(),
  pageId: z.string().min(1).nullable(),
  dataUrl: z.string().startsWith('data:image/png;base64,'),
});

/** Тело загрузки снимка (PNG в data URL). */
export type SnapshotUpload = z.infer<typeof snapshotUploadSchema>;

/**
 * Сколько живёт просьба снимка. Старше — не всплывает в визуализаторе:
 * агент мог давно уйти, а пользователь — закрыть вкладку.
 */
export const SNAPSHOT_REQUEST_TTL_MS = 10 * 60 * 1000;

/** Пределы размера снимка (base64 PNG), чтобы не принять гигабайт. */
export const MAX_SNAPSHOT_BYTES = 15 * 1024 * 1024;

function agentDir(lamDir: string): string {
  return path.join(lamDir, 'agent');
}

/** Атомарная запись: tmp → rename (обрыв посередине не портит файл). */
function writeJsonAtomic(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
}

function readJson<T>(file: string, schema: z.ZodType<T>): T | null {
  if (!existsSync(file)) {
    return null;
  }
  try {
    const parsed = schema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Сохраняет состояние визуализатора.
 *
 * @param lamDir - папка обмена
 * @param state - проверенное состояние
 */
export function writeVisualizerState(lamDir: string, state: VisualizerState): void {
  writeJsonAtomic(path.join(agentDir(lamDir), 'visualizer-state.json'), state);
}

/**
 * Последнее состояние визуализатора или null, если его ещё не публиковали.
 *
 * @param lamDir - папка обмена
 */
export function readVisualizerState(lamDir: string): VisualizerState | null {
  return readJson(
    path.join(agentDir(lamDir), 'visualizer-state.json'),
    visualizerStateSchema,
  );
}

/**
 * Создаёт новую просьбу снимка (заменяет прежнюю).
 *
 * @param lamDir - папка обмена
 * @param note - что агент хочет увидеть
 * @param now - время (для тестов)
 * @returns созданный запрос
 */
export function writeSnapshotRequest(
  lamDir: string,
  note: string | null,
  now: Date = new Date(),
): SnapshotRequest {
  const request: SnapshotRequest = {
    id: randomUUID(),
    note,
    requestedAt: now.toISOString(),
  };
  writeJsonAtomic(path.join(agentDir(lamDir), 'snapshot-request.json'), request);
  return request;
}

/**
 * Последний снимок или null.
 *
 * @param lamDir - папка обмена
 */
export function readLatestSnapshot(lamDir: string): SnapshotRecord | null {
  return readJson(
    path.join(agentDir(lamDir), 'snapshot-latest.json'),
    snapshotRecordSchema,
  );
}

/**
 * Невыполненная и не просроченная просьба снимка или null.
 *
 * @param lamDir - папка обмена
 * @param now - текущее время (для тестов)
 */
export function readPendingSnapshotRequest(
  lamDir: string,
  now: Date = new Date(),
): SnapshotRequest | null {
  const request = readJson(
    path.join(agentDir(lamDir), 'snapshot-request.json'),
    snapshotRequestSchema,
  );
  if (request === null) {
    return null;
  }
  const age = now.getTime() - Date.parse(request.requestedAt);
  if (!(age <= SNAPSHOT_REQUEST_TTL_MS)) {
    return null;
  }
  const latest = readLatestSnapshot(lamDir);
  return latest?.requestId === request.id ? null : request;
}

/**
 * Сохраняет PNG снимка и делает его последним.
 *
 * @param lamDir - папка обмена
 * @param upload - проверенное тело загрузки
 * @param now - время (для тестов)
 * @returns запись о снимке
 * @throws Error если PNG пустой или больше MAX_SNAPSHOT_BYTES
 */
export function saveSnapshot(
  lamDir: string,
  upload: SnapshotUpload,
  now: Date = new Date(),
): SnapshotRecord {
  const base64 = upload.dataUrl.slice('data:image/png;base64,'.length);
  const png = Buffer.from(base64, 'base64');
  if (png.length === 0) {
    throw new Error('снимок пустой');
  }
  if (png.length > MAX_SNAPSHOT_BYTES) {
    throw new Error(`снимок больше ${MAX_SNAPSHOT_BYTES} байт`);
  }
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const file = path.join(agentDir(lamDir), 'snapshots', `${stamp}.png`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, png);
  const record: SnapshotRecord = {
    requestId: upload.requestId,
    pageId: upload.pageId,
    file,
    capturedAt: now.toISOString(),
    bytes: png.length,
  };
  writeJsonAtomic(path.join(agentDir(lamDir), 'snapshot-latest.json'), record);
  return record;
}
