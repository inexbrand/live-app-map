/**
 * Профили сессий: куки и значения sessionStorage по origin приложения.
 * Лежат в `<корень монорепо>/.lam-sessions/profiles.json` (или
 * `$LAM_SESSIONS_DIR`), вне git, с правами 600. Пишет только процесс
 * dev-сервера визуализатора — один писатель.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { mergeSetCookies, type StoredCookie } from './cookie-jar';
import { isValidProfileId } from './gateway-host';

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
  readonly updatedAt: string;
};

/** Профиль без секретов — для UI и логов. */
export type ProfileSummary = {
  readonly id: string;
  readonly label: string;
  readonly role?: string;
  readonly origins: ReadonlyArray<{ readonly origin: string; readonly cookies: readonly string[]; readonly storageKeys: readonly string[] }>;
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
    })),
    updatedAt: p.updatedAt,
  };
}

/** Хранилище профилей в файле. */
export class SessionStore {
  private profiles = new Map<string, SessionProfile>();
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
  upsert(input: {
    readonly id: string;
    readonly label: string;
    readonly role?: string;
    readonly origin?: string;
    readonly cookies?: readonly StoredCookie[];
    readonly storage?: Readonly<Record<string, string>>;
  }): SessionProfile {
    if (!isValidProfileId(input.id)) {
      throw new Error('id профиля: строчные латинские буквы, цифры и дефис, например recruiter');
    }
    if (input.label.trim() === '') {
      throw new Error('label профиля обязателен: например «Рекрутер»');
    }
    const prev = this.profiles.get(input.id);
    const cookies = { ...(prev?.cookies ?? {}) };
    const storage = { ...(prev?.storage ?? {}) };
    if (input.origin !== undefined) {
      if (input.cookies !== undefined) {
        cookies[input.origin] = input.cookies;
      }
      if (input.storage !== undefined) {
        storage[input.origin] = { ...(storage[input.origin] ?? {}), ...input.storage };
      }
    }
    const next: SessionProfile = {
      id: input.id,
      label: input.label.trim(),
      ...(input.role === undefined || input.role.trim() === '' ? {} : { role: input.role.trim() }),
      cookies,
      storage,
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
    const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
    const list = typeof raw === 'object' && raw !== null && 'profiles' in raw && Array.isArray(raw.profiles) ? raw.profiles : [];
    for (const p of list as SessionProfile[]) {
      if (typeof p?.id === 'string' && isValidProfileId(p.id)) {
        this.profiles.set(p.id, p);
      }
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
