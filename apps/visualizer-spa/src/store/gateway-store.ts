/**
 * Состояние шлюза живых экранов в браузере: порт, профили сессий (без
 * секретов) и последние отчёты страниц (высота, 401).
 */
import { create } from 'zustand';
import { requestJson } from '../lib/dev-api';
import type { LamPageMessage } from '../lib/gateway/inject-script';
import type { ProfileSummary } from '../lib/gateway/session-store';
import type { DevAuthProfileReport, DevAuthSourceReport } from '../lib/gateway/dev-auth-sync';
import { SampleRequestLog } from '../lib/gateway/sample-retry';

/** Автовход по ролям приложений карты. */
export type AutoLoginState = {
  /** idle — не запускался; running — идёт; done — ответ получен; failed — dev-сервер не ответил. */
  readonly status: 'idle' | 'running' | 'done' | 'failed';
  /** Для каких origin карты. */
  readonly origins: readonly string[];
  /** Что ответило каждое приложение. */
  readonly sources: readonly DevAuthSourceReport[];
  /** Что стало с профилем каждой роли. */
  readonly roles: readonly DevAuthProfileReport[];
  readonly error: string | null;
};

const AUTO_IDLE: AutoLoginState = { status: 'idle', origins: [], sources: [], roles: [], error: null };

/** Ответ POST /__lam_sessions/auto. */
function parseAuto(body: unknown): { sources: DevAuthSourceReport[]; roles: DevAuthProfileReport[]; profiles: ProfileSummary[] } | null {
  if (typeof body !== 'object' || body === null || !('sources' in body) || !('roles' in body) || !('profiles' in body)) {
    return null;
  }
  const { sources, roles, profiles } = body;
  if (!Array.isArray(sources) || !Array.isArray(roles) || !Array.isArray(profiles)) {
    return null;
  }
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
  return {
    sources: sources.filter(isObj).filter((s): s is DevAuthSourceReport => typeof s['origin'] === 'string' && typeof s['state'] === 'string' && Array.isArray(s['roles'])),
    roles: roles.filter(isObj).filter((r): r is DevAuthProfileReport => typeof r['id'] === 'string' && typeof r['state'] === 'string' && typeof r['origin'] === 'string'),
    profiles: profiles.filter(isProfileSummary),
  };
}

/** Состояние шлюза. */
type GatewayState = {
  /** Автовход по ролям приложений карты. */
  readonly auto: AutoLoginState;
  /**
   * Спрашивает роли у приложений карты и заводит профили входа. Тот же набор
   * origin повторно не запускается, пока не попросят force.
   */
  readonly autoLogin: (origins: readonly string[], force?: boolean) => Promise<void>;
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

/** Запросы списков: в полёте и прочитанные не повторяются, упавшие — после паузы. */
const requested = new SampleRequestLog();

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
  auto: AUTO_IDLE,
  autoLogin: async (origins, force = false) => {
    const sorted = [...new Set(origins)].sort();
    const prev = get().auto;
    const same = prev.origins.length === sorted.length && prev.origins.every((o, i) => o === sorted[i]);
    if (sorted.length === 0 || (same && !force && prev.status !== 'idle' && prev.status !== 'failed')) {
      return;
    }
    set({ auto: { ...AUTO_IDLE, status: 'running', origins: sorted } });
    const r = await requestJson('/__lam_sessions/auto', { method: 'POST', json: { origins: sorted } });
    const parsed = r.ok ? parseAuto(r.value) : null;
    if (parsed === null) {
      set({ auto: { ...AUTO_IDLE, status: 'failed', origins: sorted, error: r.ok ? 'неверный ответ автовхода' : r.error } });
      return;
    }
    set({ auto: { status: 'done', origins: sorted, sources: parsed.sources, roles: parsed.roles, error: null }, profiles: parsed.profiles });
  },
  reports: new Map(),
  error: null,
  samples: new Map(),
  loadSamples: async (profile, origin, lists) => {
    const key = (l: string): string => `${profile}|${l}`;
    const taken = new Set(requested.take(lists.map(key), Date.now()));
    const fresh = lists.filter((l) => taken.has(key(l)));
    if (fresh.length === 0) {
      return;
    }
    let values: Record<string, string | null> = {};
    let ok = false;
    const r = await requestJson(`/__lam_sessions/${encodeURIComponent(profile)}/sample-ids`, {
      method: 'POST',
      json: { origin, lists: fresh },
    });
    const parsed = r.ok ? parseSamples(r.value) : null;
    ok = parsed !== null;
    values = parsed ?? {};
    if (!r.ok) {
      set({ error: `параметры экранов (${profile}): ${r.error}` });
    }
    if (ok) {
      requested.succeeded(fresh.map(key));
    } else {
      // Сбой (сеть, 429, шлюз): повтор после паузы, а не только после перезагрузки страницы.
      const delay = requested.failed(fresh.map(key), Date.now());
      if (delay !== null) {
        setTimeout(() => void get().loadSamples(profile, origin, fresh), delay);
      }
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
    const r = await requestJson('/__lam_sessions');
    if (!r.ok && r.status === null) {
      set({ port: null, error: r.error });
      return;
    }
    const parsed = r.ok ? parseSessions(r.value) : null;
    if (parsed === null) {
      set({ port: null, error: `шлюз не отвечает (HTTP ${r.status ?? ''})` });
      return;
    }
    set({ port: parsed.port, profiles: parsed.profiles, error: null });
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