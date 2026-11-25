/**
 * Авто-mint dogfood-сессий (admin token + miniapp initData) для live iframe.
 * Без user.telegramId miniapp остаётся на «Откройте из Telegram».
 */
import {
  fetchDogfoodActors,
  isDogfoodClientEnabled,
  mapSessionToInject,
  mintDogfoodSession,
  type DogfoodActor,
} from './dogfood-api';

export type EnsureDogfoodInput = {
  readonly dogfoodAdminAccessToken: string;
  readonly dogfoodMiniappInitData: string;
  readonly setDogfoodAdminAccessToken: (token: string) => void;
  readonly setDogfoodMiniappInitData: (raw: string) => void;
  readonly onActors?: (actors: readonly DogfoodActor[]) => void;
  readonly onError?: (message: string) => void;
  readonly onToast?: (message: string) => void;
};

export type EnsureDogfoodResult = {
  readonly ok: boolean;
  readonly mintedAdmin: boolean;
  readonly mintedMiniapp: boolean;
  readonly error?: string;
};

/** Есть ли у пользователя telegramId (без него нет initData мини-приложения). */
function hasTelegramId(a: DogfoodActor): boolean {
  return a.kind === 'user' && a.telegramId !== null && a.telegramId !== undefined && String(a.telegramId).trim() !== '';
}

/** Вход первым админом: true — токен получен и сохранён. */
async function mintAdmin(actors: readonly DogfoodActor[], input: EnsureDogfoodInput): Promise<boolean> {
  const admin = actors.find((a) => a.kind === 'admin');
  if (!admin) {
    return false;
  }
  const minted = await mintDogfoodSession(admin);
  if (!minted.ok) {
    input.onToast?.(`Admin dogfood: ${minted.error}`);
    return false;
  }
  const inj = mapSessionToInject(minted.data);
  if (!inj.adminAccessToken) {
    return false;
  }
  input.setDogfoodAdminAccessToken(inj.adminAccessToken);
  return true;
}

/** Вход пользователем с telegramId: true — initData получен и сохранён. */
async function mintMiniapp(user: DogfoodActor, input: EnsureDogfoodInput): Promise<boolean> {
  const minted = await mintDogfoodSession(user);
  if (!minted.ok) {
    input.onToast?.(`Miniapp dogfood: ${minted.error}`);
    return false;
  }
  // Роль просмотра не ставим: пользователь — первый с telegramId в случайном порядке базы,
  // а экран открывается ролью своего стейта (шлюз выбирает профиль по ней).
  const inj = mapSessionToInject(minted.data);
  if (!inj.miniappInitData) {
    return false;
  }
  input.setDogfoodMiniappInitData(inj.miniappInitData);
  return true;
}

/** Нет пользователя с telegramId: iframe мини-приложения останется без входа. */
const NO_TELEGRAM_USER = 'Miniapp: в БД нет user с telegramId — iframe останется без auth';

/**
 * Mint недостающих dogfood-сессий (dev-only).
 */
export async function ensureDogfoodSessions(
  input: EnsureDogfoodInput,
  env: { readonly PROD?: boolean; readonly MODE?: string } = import.meta.env,
): Promise<EnsureDogfoodResult> {
  const needAdmin = input.dogfoodAdminAccessToken.trim() === '';
  const needMini = input.dogfoodMiniappInitData.trim() === '';
  if (!isDogfoodClientEnabled(env) || (!needAdmin && !needMini)) {
    return { ok: true, mintedAdmin: false, mintedMiniapp: false };
  }

  const actorsRes = await fetchDogfoodActors();
  if (!actorsRes.ok) {
    return actorsUnavailable(actorsRes.error, input);
  }
  input.onActors?.(actorsRes.data);
  const mintedAdmin = needAdmin ? await mintAdmin(actorsRes.data, input) : false;
  return needMini ? ensureMiniapp(actorsRes.data, input, mintedAdmin) : { ok: true, mintedAdmin, mintedMiniapp: false };
}

/** Список пользователей не получен: ошибка в настройки и в toast. */
function actorsUnavailable(reason: string, input: EnsureDogfoodInput): EnsureDogfoodResult {
  const error = `Авто-вход недоступен: ${reason}. Поднимите API+Postgres и войдите в Настройках.`;
  input.onError?.(error);
  input.onToast?.(error);
  return { ok: false, mintedAdmin: false, mintedMiniapp: false, error };
}

/** Вход в мини-приложение любым пользователем с telegramId (роль потом — из стейтов карты). */
async function ensureMiniapp(actors: readonly DogfoodActor[], input: EnsureDogfoodInput, mintedAdmin: boolean): Promise<EnsureDogfoodResult> {
  const user = actors.find(hasTelegramId);
  if (!user) {
    input.onToast?.(NO_TELEGRAM_USER);
    return { ok: false, mintedAdmin, mintedMiniapp: false, error: NO_TELEGRAM_USER };
  }
  return { ok: true, mintedAdmin, mintedMiniapp: await mintMiniapp(user, input) };
}
