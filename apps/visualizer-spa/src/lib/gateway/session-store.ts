/**
 * Профили сессий: куки и значения sessionStorage по origin приложения.
 * Лежат в `<корень монорепо>/.lam-sessions/profiles.json` (или
 * `$LAM_SESSIONS_DIR`), вне git, с правами 600. Пишет только процесс
 * dev-сервера визуализатора — один писатель.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { mergeSetCookies, type StoredCookie } from './cookie-jar';
import { isDogfoodValueStale, KORBOR_DOGFOOD_STORAGE, mintKorbor, type KorborRenewal, type MintResult } from './korbor-dogfood';
import { isValidProfileId } from './gateway-host';
import { DEV_AUTH_MARGIN_MS, gatewayDevAuthClient, reissueDevAuth, type DevAuthLink } from './dev-auth-sync';
import { isDevAuthExpired } from '@live-app-map/dev-auth';

/** Переменная окружения с папкой профилей. */
export const LAM_SESSIONS_ENV = 'LAM_SESSIONS_DIR';

/** Профиль сессии. */
export type SessionProfile = {
  readonly id: string;
  readonly label: string;
  /** Роль в приложении: recruiter, employer, admin … */
  readonly role?: string;
  /** origin приложения → куки. */
  readonly cookies: Readonly<Record<string, readonly StoredCookie[]>>;
  /** origin → значения sessionStorage, которые шлюз ставит до загрузки приложения. */
  readonly storage: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** origin → как обновить dev-вход, когда он устареет. */
  readonly renewals?: Readonly<Record<string, KorborRenewal>>;
  /** origin → автовход приложения (`@live-app-map/dev-auth`): откуда и до какого срока. */
  readonly devAuth?: Readonly<Record<string, DevAuthLink>>;
  readonly updatedAt: string;
};

/** Профиль без секретов — для UI и логов. */
export type ProfileSummary = {
  readonly id: string;
  readonly label: string;
  readonly role?: string;
  readonly origins: ReadonlyArray<{
    readonly origin: string;
    readonly cookies: readonly string[];
    readonly storageKeys: readonly string[];
    /** Вход выдан автоматически приложением (до какого срока, ISO). */
    readonly autoUntil?: string;
  }>;
  readonly updatedAt: string;
};

/**
 * Папка профилей: `$LAM_SESSIONS_DIR` или `.lam-sessions` рядом с папкой обмена.
 *
 * @param lamDir - папка обмена (.lam-feedback) в корне монорепо
 * @param envValue - значение переменной окружения
 */
export function resolveSessionsDir(lamDir: string, envValue: string | undefined = process.env[LAM_SESSIONS_ENV]): string {
  return envValue !== undefined && envValue.trim() !== '' ? path.resolve(envValue.trim()) : path.join(path.dirname(lamDir), '.lam-sessions');
}

/**
 * Профиль без секретов.
 *
 * @param p - профиль
 */
export function summarize(p: SessionProfile): ProfileSummary {
  const origins = [...new Set([...Object.keys(p.cookies), ...Object.keys(p.storage)])].sort();
  return {
    id: p.id,
    label: p.label,
    ...(p.role === undefined ? {} : { role: p.role }),
    origins: origins.map((origin) => ({
      origin,
      cookies: (p.cookies[origin] ?? []).map((c) => c.name),
      storageKeys: Object.keys(p.storage[origin] ?? {}),
      ...(p.devAuth?.[origin] === undefined ? {} : { autoUntil: p.devAuth[origin].expiresAt }),
    })),
    updatedAt: p.updatedAt,
  };
}

/** Что записать в профиль: подпись, роль и данные одного origin. */
export type ProfileInput = {
  readonly id: string;
  readonly label: string;
  readonly role?: string;
  readonly origin?: string;
  readonly cookies?: readonly StoredCookie[];
  readonly storage?: Readonly<Record<string, string>>;
  readonly renewal?: KorborRenewal;
  readonly devAuth?: DevAuthLink;
};

function checkProfileInput(input: ProfileInput): void {
  if (!isValidProfileId(input.id)) {
    throw new Error('id профиля: строчные латинские буквы, цифры и дефис, например recruiter');
  }
  if (input.label.trim() === '') {
    throw new Error('label профиля обязателен: например «Рекрутер»');
  }
}

/** Куки, storage и продление прежнего профиля с данными нового origin поверх. */
function mergeOrigin(prev: SessionProfile | undefined, input: ProfileInput): Pick<SessionProfile, 'cookies' | 'storage'> & { renewals: Record<string, KorborRenewal>; devAuth: Record<string, DevAuthLink> } {
  const cookies = { ...(prev?.cookies ?? {}) };
  const storage = { ...(prev?.storage ?? {}) };
  const renewals = { ...(prev?.renewals ?? {}) };
  const devAuth = { ...(prev?.devAuth ?? {}) };
  if (input.origin !== undefined) {
    putOrigin(input, input.origin, { cookies, storage, renewals });
    if (input.devAuth !== undefined) {
      devAuth[input.origin] = input.devAuth;
    }
  }
  return { cookies, storage, renewals, devAuth };
}

/** Данные одного origin поверх прежних: продление и куки заменяются, storage дополняется. */
function putOrigin(input: ProfileInput, origin: string, into: { cookies: Record<string, readonly StoredCookie[]>; storage: Record<string, Readonly<Record<string, string>>>; renewals: Record<string, KorborRenewal> }): void {
  if (input.renewal !== undefined) {
    into.renewals[origin] = input.renewal;
  }
  if (input.cookies !== undefined) {
    into.cookies[origin] = input.cookies;
  }
  if (input.storage !== undefined) {
    into.storage[origin] = { ...into.storage[origin], ...input.storage };
  }
}

/** Профили файла: только с допустимым id. */
function profilesOf(raw: unknown): SessionProfile[] {
  const list: unknown[] = typeof raw === 'object' && raw !== null && 'profiles' in raw && Array.isArray(raw.profiles) ? raw.profiles : [];
  return list.filter((p): p is SessionProfile => typeof p === 'object' && p !== null && 'id' in p && typeof p.id === 'string' && isValidProfileId(p.id));
}

/** Продление origin, если вход устарел; свежий или без продления — undefined. */
function staleRenewal(profile: SessionProfile, origin: string): KorborRenewal | undefined {
  const renewal = profile.renewals?.[origin];
  if (renewal === undefined) {
    return undefined;
  }
  const value = profile.storage[origin]?.[KORBOR_DOGFOOD_STORAGE[renewal.kind]];
  return isDogfoodValueStale(renewal.kind, value, Date.now()) ? renewal : undefined;
}

/** Хранилище профилей в файле. */
export class SessionStore {
  private profiles = new Map<string, SessionProfile>();
  private readonly renewing = new Map<string, Promise<string | null>>();
  private readonly file: string;

  /**
   * @param dir - папка профилей
   */
  constructor(private readonly dir: string) {
    this.file = path.join(dir, 'profiles.json');
    this.load();
  }

  /** Все профили. */
  list(): SessionProfile[] {
    return [...this.profiles.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Профиль по id. */
  get(id: string): SessionProfile | undefined {
    return this.profiles.get(id);
  }

  /**
   * Создаёт или обновляет профиль: переданные куки и storage для origin заменяют прежние.
   *
   * @param input - id, подпись, роль, данные одного origin
   * @returns профиль
   * @throws Error при плохом id или пустой подписи
   */
  upsert(input: ProfileInput): SessionProfile {
    checkProfileInput(input);
    const { cookies, storage, renewals, devAuth } = mergeOrigin(this.profiles.get(input.id), input);
    const next: SessionProfile = {
      id: input.id,
      label: input.label.trim(),
      ...(input.role === undefined || input.role.trim() === '' ? {} : { role: input.role.trim() }),
      cookies,
      storage,
      ...(Object.keys(renewals).length === 0 ? {} : { renewals }),
      ...(Object.keys(devAuth).length === 0 ? {} : { devAuth }),
      updatedAt: new Date().toISOString(),
    };
    this.profiles.set(next.id, next);
    this.save();
    return next;
  }

  /**
   * Куки из ответа приложения — в банку профиля (профиль должен существовать).
   *
   * @param id - профиль
   * @param origin - origin приложения
   * @param setCookies - заголовки Set-Cookie
   */
  absorbSetCookies(id: string, origin: string, setCookies: readonly string[]): void {
    const prev = this.profiles.get(id);
    if (prev === undefined || setCookies.length === 0) {
      return;
    }
    const jar = mergeSetCookies(prev.cookies[origin] ?? [], setCookies, Date.now());
    this.profiles.set(id, { ...prev, cookies: { ...prev.cookies, [origin]: jar }, updatedAt: new Date().toISOString() });
    this.save();
  }

  /**
   * Обновляет dev-вход профиля для origin, если он устарел. Параллельные
   * загрузки iframe ждут одно обновление.
   *
   * @param id - профиль
   * @param origin - origin приложения
   * @returns ошибка обновления или null
   */
  ensureFresh(id: string, origin: string): Promise<string | null> {
    const key = `${id}|${origin}`;
    const running = this.renewing.get(key);
    if (running !== undefined) {
      return running;
    }
    const p = this.renew(id, origin).finally(() => this.renewing.delete(key));
    this.renewing.set(key, p);
    return p;
  }

  private async renew(id: string, origin: string): Promise<string | null> {
    const link = this.profiles.get(id)?.devAuth?.[origin];
    if (link !== undefined) {
      return isDevAuthExpired(link.expiresAt, Date.now(), DEV_AUTH_MARGIN_MS)
        ? reissueDevAuth(this, id, link, gatewayDevAuthClient()).catch((err: unknown) => (err instanceof Error ? err.message : String(err)))
        : null;
    }
    const profile = this.profiles.get(id);
    const renewal = profile === undefined ? undefined : staleRenewal(profile, origin);
    if (profile === undefined || renewal === undefined) {
      return null;
    }
    const minted = await mintKorbor(renewal).catch((err: unknown): MintResult => ({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    if (!minted.ok) {
      return minted.error;
    }
    const storageKey = KORBOR_DOGFOOD_STORAGE[renewal.kind];
    this.upsert({ id, label: profile.label, ...(profile.role === undefined ? {} : { role: profile.role }), origin, storage: { [storageKey]: minted.value } });
    return null;
  }


  /** Удаляет профиль. */
  remove(id: string): boolean {
    const had = this.profiles.delete(id);
    if (had) {
      this.save();
    }
    return had;
  }

  private load(): void {
    if (!existsSync(this.file)) {
      return;
    }
    for (const p of profilesOf(JSON.parse(readFileSync(this.file, 'utf8')))) {
      this.profiles.set(p.id, p);
    }
  }


  private save(): void {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ version: 1, profiles: this.list() }, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, this.file);
    chmodSync(this.file, 0o600);
  }
}
