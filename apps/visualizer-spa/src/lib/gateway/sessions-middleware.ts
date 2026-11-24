/**
 * REST профилей сессий на dev-сервере визуализатора: `/__lam_sessions`.
 * Ответы не содержат значений кук и токенов — только имена.
 */
import { errorMessage, isLocalOrigin, readBody, requestPath, sendError, sendJson, type DevMiddleware } from '../dev-http';
import { cookieHeaderFor, parseSetCookie, type StoredCookie } from './cookie-jar';
import { isValidProfileId } from './gateway-host';
import { KORBOR_DOGFOOD_STORAGE, createBearerCache, mintKorbor, type BearerSource, type KorborRenewal } from './korbor-dogfood';
import { gatewayDevAuthClient, syncDevAuth, type DevAuthSyncReport } from './dev-auth-sync';
import { fetchSampleIds } from './sample-ids';
import { summarize, type SessionStore } from './session-store';

/** Префикс маршрутов. */
export const SESSIONS_PATH = '/__lam_sessions';


const MAX_BODY = 64 * 1024;

/** Тело JSON-объектом или null. */
function asObject(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text);
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : null;
  } catch {
    return null;
  }
}

function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  return typeof v === 'string' ? v.trim() : '';
}

/** Origin приложения из тела: обязателен для данных сессии. */
function originOf(o: Record<string, unknown>): string | null {
  try {
    const u = new URL(str(o, 'origin'));
    return u.origin;
  } catch {
    return null;
  }
}

type Req = Parameters<DevMiddleware>[0];
type Res = Parameters<DevMiddleware>[1];

/** Автовход в полёте по набору origin: двойной вызов (StrictMode, две вкладки) ждёт один. */
type AutoRuns = Map<string, Promise<DevAuthSyncReport>>;

/** Окружение запроса: хранилище, порт шлюза, кэш Bearer, автовходы в полёте и ответ. */
type Ctx = { readonly store: SessionStore; readonly gatewayPort: number; readonly bearer: BearerSource; readonly auto: AutoRuns; readonly req: Req; readonly res: Res; readonly path: string };

/** Имя «профиля» в пути, занятое автовходом. */
export const AUTO_LOGIN_SEGMENT = 'auto';

/** Origin экранов из тела автовхода; не массив адресов — null. */
function autoOrigins(o: Record<string, unknown> | null): string[] | null {
  const raw = o?.['origins'];
  if (!Array.isArray(raw)) {
    return null;
  }
  const out = new Set<string>();
  for (const v of raw) {
    try {
      out.add(new URL(String(v)).origin);
    } catch {
      return null;
    }
  }
  return [...out].sort();
}

/** Автовход: роли приложений карты → профили; отвечает итогом и профилями. */
async function handleAuto(ctx: Ctx): Promise<void> {
  const body = await readBody(ctx.req, MAX_BODY);
  if (!body.ok) {
    sendError(ctx.res, body.status, body.error);
    return;
  }
  const origins = autoOrigins(asObject(body.text));
  if (origins === null || origins.length === 0) {
    fieldError(ctx.res, 'origins', 'origins обязателен: адреса приложений карты, например ["http://localhost:16002"]');
    return;
  }
  const key = origins.join(' ');
  const run = ctx.auto.get(key) ?? syncDevAuth(ctx.store, origins, gatewayDevAuthClient()).finally(() => ctx.auto.delete(key));
  ctx.auto.set(key, run);
  const report = await run;
  sendJson(ctx.res, 200, { ok: true, sources: report.sources, roles: report.profiles, profiles: ctx.store.list().map(summarize) });
}

/** Тело запроса профиля: объект и origin приложения. */
type ProfileBody = { readonly o: Record<string, unknown>; readonly origin: string };

/** Отказ по полю: текст и имя поля для подсказки в форме. */
function fieldError(res: Res, field: string, error: string): void {
  sendJson(res, 400, { ok: false, error, field });
}

/** Только сама страница визуализатора: страницы приложений в iframe шлюза тоже *.localhost. */
function isVisualizerPage(req: Req): boolean {
  const origin = req.headers.origin;
  return isLocalOrigin(req) && (origin === undefined || origin === '' || origin === `http://${req.headers.host ?? ''}`);
}

async function handleSessions(ctx: Ctx, method: string, profileId: string, act: string): Promise<void> {
  if (method === 'POST' && profileId === AUTO_LOGIN_SEGMENT && act === '') {
    await handleAuto(ctx);
    return;
  }
  if (method === 'GET' && profileId === '') {
    sendJson(ctx.res, 200, { ok: true, gatewayPort: ctx.gatewayPort, profiles: ctx.store.list().map(summarize) });
    return;
  }
  if (!isValidProfileId(profileId)) {
    fieldError(ctx.res, 'id', 'id профиля: строчные латинские буквы, цифры, дефис (например recruiter)');
    return;
  }
  if (method === 'DELETE' && act === '') {
    sendJson(ctx.res, ctx.store.remove(profileId) ? 200 : 404, { ok: true });
    return;
  }
  const body = await readProfileBody(ctx);
  if (body !== null) {
    await handleWithBody(ctx, `${method} ${act}`, profileId, body);
  }
}

/** JSON-объект тела с origin; ошибка уже отправлена — null. */
async function readProfileBody(ctx: Ctx): Promise<ProfileBody | null> {
  const body = await readBody(ctx.req, MAX_BODY);
  if (!body.ok) {
    sendError(ctx.res, body.status, body.error);
    return null;
  }
  const o = asObject(body.text);
  if (o === null) {
    sendError(ctx.res, 400, 'тело — JSON-объект');
    return null;
  }
  const origin = originOf(o);
  if (origin === null) {
    fieldError(ctx.res, 'origin', 'origin обязателен: адрес приложения, например http://localhost:16002');
    return null;
  }
  return { o, origin };
}

async function handleWithBody(ctx: Ctx, route: string, profileId: string, body: ProfileBody): Promise<void> {
  if (route === 'POST sample-ids') {
    await sampleIds(ctx, profileId, body.origin, body.o['lists']);
    return;
  }
  const label = str(body.o, 'label');
  if (label === '') {
    fieldError(ctx.res, 'label', 'label обязателен: подпись профиля, например «Админ»');
    return;
  }
  if (route === 'PUT ') {
    putSession(ctx, profileId, label, body);
    return;
  }
  if (route === 'POST korbor-dogfood') {
    await korborSession(ctx, profileId, label, body);
    return;
  }
  sendError(ctx.res, 405, `${route.split(' ')[0] ?? ''} ${ctx.path} не поддерживается`);
}

/** Куки «a=1; b=2» из тела; пусто — undefined. */
function cookiesOf(o: Record<string, unknown>, now: number): StoredCookie[] | undefined {
  const text = str(o, 'cookies');
  return text === '' ? undefined : text.split(';').map((s) => parseSetCookie(s.trim(), now)).filter((c) => c !== null);
}

/** storage {ключ: строка} из тела (не строки отбрасываются); не объект — undefined. */
function storageOf(o: Record<string, unknown>): Record<string, string> | undefined {
  const raw = o['storage'];
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === 'string'))
    : undefined;
}

/** Профиль из вставленных кук и/или storage. */
function putSession(ctx: Ctx, profileId: string, label: string, { o, origin }: ProfileBody): void {
  const cookies = cookiesOf(o, Date.now());
  const storage = storageOf(o);
  if (cookies === undefined && storage === undefined) {
    fieldError(ctx.res, 'cookies', 'нужны cookies («a=1; b=2») или storage ({ключ: значение})');
    return;
  }
  const saved = ctx.store.upsert({ id: profileId, label, role: str(o, 'role'), origin, ...(cookies === undefined ? {} : { cookies }), ...(storage === undefined ? {} : { storage }) });
  sendJson(ctx.res, 200, { ok: true, profile: summarize(saved) });
}

/** Продление dev-входа Korbor из тела: тип, актёр, адрес API; нет поля — отказ отправлен, null. */
function renewalOf(res: Res, o: Record<string, unknown>): KorborRenewal | null {
  const kind = str(o, 'kind') === 'admin' ? 'admin' : 'user';
  const actorId = str(o, 'actorId');
  const apiBase = str(o, 'apiBase');
  if (actorId === '' || apiBase === '') {
    fieldError(res, actorId === '' ? 'actorId' : 'apiBase', 'actorId и apiBase обязательны (apiBase — адрес API korbor, например http://127.0.0.1:16000)');
    return null;
  }
  return { kind, actorId, apiBase };
}

/** Dev-вход Korbor: API выдаёт вход актёра, профиль запоминает его и как продлить. */
async function korborSession(ctx: Ctx, profileId: string, label: string, { o, origin }: ProfileBody): Promise<void> {
  const renewal = renewalOf(ctx.res, o);
  if (renewal === null) {
    return;
  }
  const minted = await mintKorbor(renewal);
  if (!minted.ok) {
    sendError(ctx.res, 502, minted.error);
    return;
  }
  const role = str(o, 'role');
  const saved = ctx.store.upsert({
    id: profileId,
    label,
    role: role === '' ? minted.role : role,
    origin,
    storage: { [KORBOR_DOGFOOD_STORAGE[renewal.kind]]: minted.value },
    renewal,
  });
  sendJson(ctx.res, 200, { ok: true, actor: { label: minted.label, role: minted.role }, profile: summarize(saved) });
}

/** Значение dev-входа профиля для origin (initData или токен); нет — пусто. */
function loginValue(store: SessionStore, profileId: string, origin: string, renewal: KorborRenewal): string {
  return store.get(profileId)?.storage[origin]?.[KORBOR_DOGFOOD_STORAGE[renewal.kind]] ?? '';
}

/** Первые id списков API под профилем: реальные параметры маршрутов экранов. */
async function sampleIds(ctx: Ctx, profileId: string, origin: string, rawLists: unknown): Promise<void> {
  const lists = Array.isArray(rawLists) ? rawLists.filter((l): l is string => typeof l === 'string') : [];
  if (ctx.store.get(profileId)?.devAuth?.[origin] !== undefined) {
    await devAuthSampleIds(ctx, profileId, origin, lists);
    return;
  }
  const renewal = ctx.store.get(profileId)?.renewals?.[origin];
  if (renewal === undefined) {
    sendError(ctx.res, 404, `у профиля «${profileId}» нет dev-входа для ${origin}: войдите через «Профили»`);
    return;
  }
  const stale = await ctx.store.ensureFresh(profileId, origin);
  if (stale !== null) {
    sendError(ctx.res, 502, stale);
    return;
  }
  const bearer = await ctx.bearer(renewal, loginValue(ctx.store, profileId, origin, renewal));
  if (!bearer.ok) {
    sendError(ctx.res, 502, bearer.error);
    return;
  }
  const token = bearer.token;
  sendJson(ctx.res, 200, { ok: true, values: await fetchSampleIds(renewal.apiBase, () => ({ authorization: `Bearer ${token}` }), lists) });
}

/**
 * Списки под профилем автовхода: куки сессии роли, запрос через /api самого
 * фронтенда (протокол dev-входа: фронтенд проксирует /api на бэкенд).
 */
async function devAuthSampleIds(ctx: Ctx, profileId: string, origin: string, lists: readonly string[]): Promise<void> {
  const stale = await ctx.store.ensureFresh(profileId, origin);
  if (stale !== null) {
    sendError(ctx.res, 502, stale);
    return;
  }
  const jar = ctx.store.get(profileId)?.cookies[origin] ?? [];
  const now = Date.now();
  const headersFor = (list: string): Record<string, string> => {
    const cookie = cookieHeaderFor('', jar, list, now);
    return cookie === '' ? {} : { cookie };
  };
  sendJson(ctx.res, 200, { ok: true, values: await fetchSampleIds(origin, headersFor, lists) });
}

/**
 * Middleware профилей.
 *
 * @param store - хранилище профилей
 * @param gatewayPort - порт шлюза (отдаётся клиенту)
 */
export function createSessionsMiddleware(store: SessionStore, gatewayPort: number): DevMiddleware {
  const bearer = createBearerCache();
  const auto: AutoRuns = new Map();
  return (req, res, next) => {
    const p = requestPath(req);
    if (p !== SESSIONS_PATH && !p.startsWith(`${SESSIONS_PATH}/`)) {
      next();
      return;
    }
    if (!isVisualizerPage(req)) {
      sendError(res, 403, 'профили доступны только странице визуализатора');
      return;
    }
    const [profileId = '', act = ''] = p.slice(SESSIONS_PATH.length).split('/').filter((s) => s !== '');
    void handleSessions({ store, gatewayPort, bearer, auto, req, res, path: p }, req.method ?? 'GET', profileId, act).catch((err: unknown) => {
      sendError(res, 500, errorMessage(err));
    });
  };
}
