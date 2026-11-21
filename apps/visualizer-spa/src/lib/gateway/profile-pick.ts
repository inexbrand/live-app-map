/**
 * Какой профиль сессии у экрана: роль стейта ноды или общая роль, иначе
 * первый профиль, у которого есть данные для этого приложения, иначе без входа.
 */
import { ANON_PROFILE } from './gateway-host';
import type { AppMapNode } from '@live-app-map/schema';
import type { ProfileSummary } from './session-store';

/** Что известно об экране. */
export type ProfilePickInput = {
  readonly profiles: readonly ProfileSummary[];
  /** origin страницы приложения. */
  readonly appOrigin: string;
  /** Активный стейт ноды (recruiter, employer …). */
  readonly stateName?: string;
  /** Первый стейт ноды — роль по умолчанию для экрана. */
  readonly defaultStateName?: string;
  /** Роль, выбранная в тулбаре. */
  readonly globalRole?: string;
};

/**
 * Профиль экрана.
 *
 * @param input - профили, origin и роли
 * @returns id профиля
 */
export function pickProfile(input: ProfilePickInput): string {
  const forApp = input.profiles.filter((p) => p.origins.some((o) => o.origin === input.appOrigin));
  const byRole = (role: string | undefined): ProfileSummary | undefined =>
    role === undefined || role === '' ? undefined : forApp.find((p) => p.id === role || p.role === role);
  return (
    byRole(input.stateName) ??
    byRole(input.globalRole) ??
    byRole(input.defaultStateName) ??
    forApp[0]
  )?.id ?? ANON_PROFILE;
}
/**
 * Профиль экрана карты: роль активного стейта, общая роль, первый стейт ноды.
 *
 * @param node - экран
 * @param ctx - профили, origin приложения, активный стейт, общая роль
 * @returns id профиля
 */
export function pickNodeProfile(
  node: AppMapNode,
  ctx: { readonly profiles: readonly ProfileSummary[]; readonly appOrigin: string; readonly stateName: string | undefined; readonly globalRole: string },
): string {
  return pickProfile({
    profiles: ctx.profiles,
    appOrigin: ctx.appOrigin,
    ...(ctx.stateName === undefined ? {} : { stateName: ctx.stateName }),
    ...(node.states?.[0] === undefined ? {} : { defaultStateName: node.states[0].name }),
    globalRole: ctx.globalRole,
  });
}
