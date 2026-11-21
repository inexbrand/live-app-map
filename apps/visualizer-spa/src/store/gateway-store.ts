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
};

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
      prev.scrollHeight === report.scrollHeight &&
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
