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
  readonly setGlobalRole?: (role: string) => void;
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

/**
 * Mint недостающих dogfood-сессий (dev-only).
 */
export async function ensureDogfoodSessions(
  input: EnsureDogfoodInput,
  env: { readonly PROD?: boolean; readonly MODE?: string } = import.meta.env,
): Promise<EnsureDogfoodResult> {
  if (!isDogfoodClientEnabled(env)) {
    return { ok: true, mintedAdmin: false, mintedMiniapp: false };
  }

  const needAdmin = input.dogfoodAdminAccessToken.trim() === '';
  const needMini = input.dogfoodMiniappInitData.trim() === '';
  if (!needAdmin && !needMini) {
    return { ok: true, mintedAdmin: false, mintedMiniapp: false };
  }

  const actorsRes = await fetchDogfoodActors();
  if (!actorsRes.ok) {
    const error = `Авто-вход недоступен: ${actorsRes.error}. Поднимите API+Postgres и войдите в Настройках.`;
    input.onError?.(error);
    input.onToast?.(error);
    return { ok: false, mintedAdmin: false, mintedMiniapp: false, error };
  }
  input.onActors?.(actorsRes.data);

  let mintedAdmin = false;
  let mintedMiniapp = false;

  if (needAdmin) {
    const admin = actorsRes.data.find((a) => a.kind === 'admin');
    if (admin) {
      const minted = await mintDogfoodSession(admin);
      if (minted.ok) {
        const inj = mapSessionToInject(minted.data);
        if (inj.adminAccessToken) {
          input.setDogfoodAdminAccessToken(inj.adminAccessToken);
          mintedAdmin = true;
        }
      } else {
        input.onToast?.(`Admin dogfood: ${minted.error}`);
      }
    }
  }

  if (needMini) {
    // Prefer any user with telegramId (initData); role later via map states.
    const user =
      actorsRes.data.find(
        (a) =>
          a.kind === 'user' &&
          a.telegramId !== null &&
          a.telegramId !== undefined &&
          String(a.telegramId).trim() !== '',
      ) ?? undefined;
    if (user) {
      const minted = await mintDogfoodSession(user);
      if (minted.ok) {
        const inj = mapSessionToInject(minted.data);
        if (inj.miniappInitData) {
          input.setDogfoodMiniappInitData(inj.miniappInitData);
          mintedMiniapp = true;
        }
        if (inj.globalRole && input.setGlobalRole) {
          input.setGlobalRole(inj.globalRole);
        }
      } else {
        input.onToast?.(`Miniapp dogfood: ${minted.error}`);
      }
    } else {
      const msg =
        'Miniapp: в БД нет user с telegramId — iframe останется без auth';
      input.onToast?.(msg);
      return {
        ok: false,
        mintedAdmin,
        mintedMiniapp: false,
        error: msg,
      };
    }
  }

  return { ok: true, mintedAdmin, mintedMiniapp };
}
