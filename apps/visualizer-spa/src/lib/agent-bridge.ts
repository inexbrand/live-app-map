/**
 * Браузерная сторона моста к агенту (dev-сервер, /api/agent-state).
 * Визуализатор публикует, что открыто, забирает просьбы снимка и
 * отправляет готовые снимки. Без dev-сервера (preview, статика) мост
 * молча выключается: эндпоинт отвечает 404.
 */
import type { SnapshotRequest, VisualizerState } from '@live-app-map/mcp-server';

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
  try {
    const res = await fetchFn(AGENT_STATE_URL, { cache: 'no-store' });
    if (res.status === 404) {
      return { ok: false, unavailable: true, error: 'нет dev-сервера' };
    }
    if (!res.ok) {
      return { ok: false, unavailable: false, error: `HTTP ${res.status}` };
    }
    const body: unknown = await res.json();
    const raw = typeof body === 'object' && body !== null && 'pendingSnapshotRequest' in body
      ? body.pendingSnapshotRequest
      : null;
    return { ok: true, request: parseRequest(raw) };
  } catch (err) {
    return { ok: false, unavailable: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function postJson(url: string, body: unknown, fetchFn: typeof fetch): Promise<Response> {
  return fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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
  try {
    return (await postJson(AGENT_STATE_URL, state, fetchFn)).ok;
  } catch {
    return false;
  }
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
  try {
    const res = await postJson(AGENT_SNAPSHOT_URL, upload, fetchFn);
    const body: unknown = await res.json();
    if (!res.ok) {
      const error = typeof body === 'object' && body !== null && 'error' in body ? String(body.error) : `HTTP ${res.status}`;
      return { ok: false, error };
    }
    const snap = typeof body === 'object' && body !== null && 'snapshot' in body ? body.snapshot : null;
    const file = typeof snap === 'object' && snap !== null && 'file' in snap ? String(snap.file) : '';
    return { ok: true, file };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
