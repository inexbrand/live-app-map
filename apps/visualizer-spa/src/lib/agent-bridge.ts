/**
 * Браузерная сторона моста к агенту (dev-сервер, /api/agent-state).
 * Визуализатор публикует, что открыто, забирает просьбы снимка и
 * отправляет готовые снимки. Без dev-сервера (preview, статика) мост
 * молча выключается: эндпоинт отвечает 404.
 */
import type { SnapshotRequest, VisualizerState } from '@live-app-map/mcp-server';
import { requestJson, requestOk } from './dev-api';

/** Путь состояния на dev-сервере. */
export const AGENT_STATE_URL = '/api/agent-state';

/** Путь загрузки снимка. */
export const AGENT_SNAPSHOT_URL = '/api/agent-state/snapshot';

/** Что нужно из store для публикации. */
export type VisualizerStateInput = {
  readonly mapName: string | null;
  readonly baseUrl: string | null;
  readonly mode: string;
  readonly role: string;
  readonly pageCount: number;
  readonly selected: {
    readonly id: string;
    readonly title: string;
    readonly path: string | null;
    readonly url: string | null;
    readonly stateName: string | null;
  } | null;
};

/**
 * Состояние для агента; пустые строки становятся null.
 *
 * @param input - выжимка store
 * @param now - время публикации
 */
export function buildVisualizerState(input: VisualizerStateInput, now: Date): VisualizerState {
  const orNull = (s: string | null): string | null => (s === null || s.trim() === '' ? null : s);
  return {
    mapName: orNull(input.mapName),
    baseUrl: orNull(input.baseUrl),
    mode: input.mode,
    role: orNull(input.role),
    pageCount: input.pageCount,
    selectedPage: input.selected,
    updatedAt: now.toISOString(),
  };
}

/**
 * Ключ состояния без времени: публикуем, только когда он изменился.
 *
 * @param state - состояние
 */
export function visualizerStateKey(state: VisualizerState): string {
  return JSON.stringify({ ...state, updatedAt: '' });
}

/** Ответ GET /api/agent-state. */
export type AgentPollResult =
  | { readonly ok: true; readonly request: SnapshotRequest | null }
  /** unavailable — эндпоинта нет (не dev-сервер), опрос можно прекратить */
  | { readonly ok: false; readonly unavailable: boolean; readonly error: string };

function parseRequest(v: unknown): SnapshotRequest | null {
  if (typeof v !== 'object' || v === null) {
    return null;
  }
  const id = 'id' in v ? v.id : undefined;
  const note = 'note' in v ? v.note : null;
  const requestedAt = 'requestedAt' in v ? v.requestedAt : undefined;
  if (typeof id !== 'string' || typeof requestedAt !== 'string') {
    return null;
  }
  return { id, note: typeof note === 'string' ? note : null, requestedAt };
}

/**
 * Забирает невыполненную просьбу агента.
 *
 * @param fetchFn - fetch (подменяется в тестах)
 */
export async function pollAgentRequest(fetchFn: typeof fetch = fetch): Promise<AgentPollResult> {
  const r = await requestJson(AGENT_STATE_URL, { cache: 'no-store', fetchFn });
  if (!r.ok) {
    return r.status === 404
      ? { ok: false, unavailable: true, error: 'нет dev-сервера' }
      : { ok: false, unavailable: false, error: r.status === null ? r.error : `HTTP ${r.status}` };
  }
  const body = r.value;
  const raw = typeof body === 'object' && body !== null && 'pendingSnapshotRequest' in body
    ? body.pendingSnapshotRequest
    : null;
  return { ok: true, request: parseRequest(raw) };
}

/**
 * Публикует состояние.
 *
 * @param state - состояние
 * @param fetchFn - fetch
 * @returns false, если сервер не принял
 */
export async function publishVisualizerState(
  state: VisualizerState,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  return requestOk(AGENT_STATE_URL, { method: 'POST', json: state, fetchFn });
}

/** Результат отправки снимка. */
export type UploadResult = { readonly ok: true; readonly file: string } | { readonly ok: false; readonly error: string };

/**
 * Отправляет PNG снимка на dev-сервер.
 *
 * @param upload - id просьбы (или null), экран и data URL
 * @param fetchFn - fetch
 */
export async function uploadSnapshot(
  upload: { readonly requestId: string | null; readonly pageId: string | null; readonly dataUrl: string },
  fetchFn: typeof fetch = fetch,
): Promise<UploadResult> {
  const r = await requestJson(AGENT_SNAPSHOT_URL, { method: 'POST', json: upload, fetchFn });
  if (!r.ok) {
    return { ok: false, error: r.error };
  }
  const body = r.value;
  const snap = typeof body === 'object' && body !== null && 'snapshot' in body ? body.snapshot : null;
  const file = typeof snap === 'object' && snap !== null && 'file' in snap ? String(snap.file) : '';
  return { ok: true, file };
}
