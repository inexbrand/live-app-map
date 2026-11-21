/**
 * Состояние шлюза живых экранов в браузере: порт, профили сессий (без
 * секретов) и последние отчёты страниц (высота, 401).
 */
import { create } from 'zustand';
import type { LamPageMessage } from '../lib/gateway/inject-script';
import type { ProfileSummary } from '../lib/gateway/session-store';

/** Состояние шлюза. */
type GatewayState = {
  /** Порт шлюза; null — шлюз не отвечает, экраны открываются напрямую. */
  readonly port: number | null;
  readonly profiles: readonly ProfileSummary[];
  /** id ноды → последний отчёт её страницы. */
  readonly reports: ReadonlyMap<string, LamPageMessage>;
  /** Ошибка загрузки профилей. */
  readonly error: string | null;
  /** Перечитывает профили и порт с dev-сервера. */
  readonly refresh: () => Promise<void>;
  readonly setReport: (nodeId: string, report: LamPageMessage) => void;
  /** Профиль → список API → первый id (null — список пуст, закрыт профилю или не прочитан). */
  readonly samples: ReadonlyMap<string, ReadonlyMap<string, string | null>>;
  /** Читает первые id списков под профилем (каждый список — один раз). */
  readonly loadSamples: (profile: string, origin: string, lists: readonly string[]) => Promise<void>;
};

/** Ответ POST /__lam_sessions/<профиль>/sample-ids. */
function parseSamples(body: unknown): Record<string, string | null> | null {
  const values = typeof body === 'object' && body !== null && 'values' in body ? body.values : null;
  if (typeof values !== 'object' || values === null) {
    return null;
  }
  return Object.fromEntries(Object.entries(values).map(([k, v]): [string, string | null] => [k, typeof v === 'string' ? v : null]));
}

/** Запросы в полёте: профиль|список — второй раз не запрашиваем. */
const requested = new Set<string>();

/** Ответ GET /__lam_sessions. */
function parseSessions(body: unknown): { port: number; profiles: ProfileSummary[] } | null {
  if (typeof body !== 'object' || body === null || !('gatewayPort' in body) || !('profiles' in body)) {
    return null;
  }
  const port = body.gatewayPort;
  const profiles = body.profiles;
  return typeof port === 'number' && Array.isArray(profiles) ? { port, profiles: profiles.filter(isProfileSummary) } : null;
}

function isProfileSummary(v: unknown): v is ProfileSummary {
  return typeof v === 'object' && v !== null && 'id' in v && typeof v.id === 'string' && 'origins' in v && Array.isArray(v.origins);
}

/** Store шлюза. */
export const useGatewayStore = create<GatewayState>((set, get) => ({
  port: null,
  profiles: [],
  reports: new Map(),
  error: null,
  samples: new Map(),
  loadSamples: async (profile, origin, lists) => {
    const fresh = lists.filter((l) => !requested.has(`${profile}|${l}`));
    if (fresh.length === 0) {
      return;
    }
    fresh.forEach((l) => requested.add(`${profile}|${l}`));
    let values: Record<string, string | null> = {};
    try {
      const res = await fetch(`/__lam_sessions/${encodeURIComponent(profile)}/sample-ids`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ origin, lists: fresh }),
      });
      const body: unknown = await res.json().catch(() => null);
      values = (res.ok ? parseSamples(body) : null) ?? {};
      if (!res.ok) {
        const msg = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string' ? body.error : `HTTP ${res.status}`;
        set({ error: `параметры экранов (${profile}): ${msg}` });
      }
    } catch (err) {
      set({ error: `параметры экранов (${profile}): ${err instanceof Error ? err.message : String(err)}` });
    }
    const samples = new Map(get().samples);
    const forProfile = new Map(samples.get(profile) ?? []);
    for (const l of fresh) {
      forProfile.set(l, values[l] ?? null);
    }
    samples.set(profile, forProfile);
    set({ samples });
  },
  refresh: async () => {
    try {
      const res = await fetch('/__lam_sessions', { headers: { accept: 'application/json' } });
      const parsed = res.ok ? parseSessions(await res.json()) : null;
      if (parsed === null) {
        set({ port: null, error: `шлюз не отвечает (HTTP ${res.status})` });
        return;
      }
      set({ port: parsed.port, profiles: parsed.profiles, error: null });
    } catch (err) {
      set({ port: null, error: err instanceof Error ? err.message : String(err) });
    }
  },
  setReport: (nodeId, report) => {
    const prev = get().reports.get(nodeId);
    if (
      prev !== undefined &&
      prev.contentHeight === report.contentHeight &&
      prev.viewportHeight === report.viewportHeight &&
      prev.authFailures === report.authFailures &&
      prev.href === report.href
    ) {
      return;
    }
    const reports = new Map(get().reports);
    reports.set(nodeId, report);
    set({ reports });
  },
}));