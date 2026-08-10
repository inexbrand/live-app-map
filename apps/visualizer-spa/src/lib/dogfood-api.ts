/**
 * Клиент DEV dogfood API Korbor (list actors + mint session).
 * База: VITE_KORBOR_API_URL или http://localhost:16000.
 */

export type DogfoodActor = {
  readonly id: string;
  readonly kind: 'admin' | 'user';
  readonly label: string;
  readonly role: string;
  readonly email?: string | null;
  readonly telegramId?: string | null;
  readonly displayName?: string | null;
};

export type DogfoodSession = {
  readonly kind: 'admin' | 'user';
  readonly actorId: string;
  readonly label: string;
  readonly role: string;
  readonly accessToken?: string;
  readonly initData?: string;
  readonly expiresIn?: number;
};

export type DogfoodApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string };

/**
 * Base URL Korbor API for dogfood.
 */
export function getKorborApiBase(): string {
  const fromEnv =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    typeof import.meta.env['VITE_KORBOR_API_URL'] === 'string'
      ? String(import.meta.env['VITE_KORBOR_API_URL']).trim()
      : '';
  if (fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, '');
  }
  return 'http://localhost:16000';
}

/**
 * GET /api/v1/dev/dogfood/actors
 */
export async function fetchDogfoodActors(
  apiBase: string = getKorborApiBase(),
): Promise<DogfoodApiResult<readonly DogfoodActor[]>> {
  try {
    const res = await fetch(`${apiBase}/api/v1/dev/dogfood/actors`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `actors HTTP ${res.status} — API dev dogfood недоступен?`,
      };
    }
    const body = (await res.json()) as {
      data?: { actors?: DogfoodActor[] };
    };
    const actors = body.data?.actors;
    if (!Array.isArray(actors)) {
      return { ok: false, error: 'actors: неверный ответ API' };
    }
    return { ok: true, data: actors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `actors: ${message.slice(0, 160)} (поднимите Korbor API :16000)`,
    };
  }
}

/**
 * POST /api/v1/dev/dogfood/session
 */
export async function mintDogfoodSession(
  actor: Pick<DogfoodActor, 'id' | 'kind'>,
  apiBase: string = getKorborApiBase(),
): Promise<DogfoodApiResult<DogfoodSession>> {
  try {
    const res = await fetch(`${apiBase}/api/v1/dev/dogfood/session`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ kind: actor.kind, actorId: actor.id }),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const errBody = (await res.json()) as {
          error?: { message?: string; code?: string };
        };
        if (errBody.error?.message) {
          detail = errBody.error.message;
        } else if (errBody.error?.code) {
          detail = errBody.error.code;
        }
      } catch {
        /* ignore */
      }
      return { ok: false, error: `session: ${detail}` };
    }
    const body = (await res.json()) as { data?: DogfoodSession };
    if (!body.data) {
      return { ok: false, error: 'session: пустой data' };
    }
    return { ok: true, data: body.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `session: ${message.slice(0, 160)}` };
  }
}

/**
 * Подпись для UI select: «[admin] ops@…» / «[recruiter] Имя».
 */
export function formatDogfoodActorOption(a: DogfoodActor): string {
  const kindRu = a.kind === 'admin' ? 'админ' : a.role;
  return `[${kindRu}] ${a.label}`;
}

/** Поля inject для store / resolveLiveUrl после mint. */
export type DogfoodInjectApply = {
  readonly adminAccessToken: string;
  readonly miniappInitData: string;
  /** recruiter | employer | '' */
  readonly globalRole: string;
  readonly toast: string;
};

/**
 * Маппинг mint-ответа → inject state (без side-effects).
 * Админ: token, user: initData + role map.
 */
export function mapSessionToInject(session: DogfoodSession): DogfoodInjectApply {
  if (session.kind === 'admin') {
    const token = session.accessToken?.trim() ?? '';
    return {
      adminAccessToken: token,
      miniappInitData: '',
      globalRole: '',
      toast: token
        ? `Вход как админ: ${session.label}`
        : `Админ ${session.label}: нет accessToken`,
    };
  }
  const initData = session.initData?.trim() ?? '';
  const role =
    session.role === 'recruiter' || session.role === 'employer'
      ? session.role
      : '';
  return {
    adminAccessToken: '',
    miniappInitData: initData,
    globalRole: role,
    toast: initData
      ? `Вход как ${session.role}: ${session.label}`
      : `User ${session.label}: нет initData (нужен telegramId)`,
  };
}

/**
 * Production-safe: dogfood UI/client должен отключаться в production bundle.
 * (Vite: import.meta.env.PROD / MODE.)
 */
export function isDogfoodClientEnabled(
  env: { readonly PROD?: boolean; readonly MODE?: string } = {},
): boolean {
  if (env.PROD === true) {
    return false;
  }
  if (env.MODE === 'production') {
    return false;
  }
  return true;
}
