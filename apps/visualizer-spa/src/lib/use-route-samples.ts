/**
 * Загружает реальные значения параметров маршрутов экранов карты под их
 * профилями: группирует списки API по профилю и origin приложения.
 */
import { resolveNodeUrl } from '@live-app-map/graph';
import type { AppMapDocument } from '@live-app-map/schema';
import { useEffect } from 'react';
import { ANON_PROFILE } from './gateway/gateway-host';
import { pickNodeProfile } from './gateway/profile-pick';
import type { ProfileSummary } from './gateway/session-store';
import { nodeSampleLists } from './route-samples';
import { useAppStore } from '../store/app-store';
import { useGatewayStore } from '../store/gateway-store';

/** Запрос списков под одним профилем для одного приложения. */
export type SampleRequest = { readonly profile: string; readonly origin: string; readonly lists: readonly string[] };

/** Что влияет на профиль экрана. */
export type SampleContext = {
  readonly baseUrl: string | null;
  readonly profiles: readonly ProfileSummary[];
  readonly activeStates: ReadonlyMap<string, string>;
  readonly globalRole: string;
};

/**
 * Запросы списков по экранам карты: экраны без входа (anon) пропускаются.
 *
 * @param doc - карта
 * @param ctx - адрес приложения, профили, стейты и общая роль
 */
export function sampleRequests(doc: AppMapDocument, ctx: SampleContext): SampleRequest[] {
  const groups = new Map<string, { profile: string; origin: string; lists: Set<string> }>();
  for (const node of doc.nodes) {
    const lists = nodeSampleLists(doc, node);
    const url = lists.length === 0 ? null : resolveNodeUrl(node, ctx.baseUrl);
    const origin = url === null ? '' : new URL(url).origin;
    const profile = origin === '' ? ANON_PROFILE : pickNodeProfile(node, { profiles: ctx.profiles, appOrigin: origin, stateName: ctx.activeStates.get(node.id), globalRole: ctx.globalRole });
    if (profile === ANON_PROFILE) {
      continue;
    }
    const g = groups.get(`${profile}|${origin}`) ?? { profile, origin, lists: new Set<string>() };
    lists.forEach((l) => g.lists.add(l));
    groups.set(`${profile}|${origin}`, g);
  }
  return [...groups.values()].map((g) => ({ profile: g.profile, origin: g.origin, lists: [...g.lists] }));
}

/**
 * Хук: при смене карты, профилей, ролей и стейтов дочитывает недостающие списки.
 */
export function useRouteSamples(): void {
  const document = useAppStore((s) => s.document);
  const activeStates = useAppStore((s) => s.activeStates);
  const globalRole = useAppStore((s) => s.globalRole);
  const baseUrlOverride = useAppStore((s) => s.baseUrlOverride);
  const port = useGatewayStore((s) => s.port);
  const profiles = useGatewayStore((s) => s.profiles);
  const loadSamples = useGatewayStore((s) => s.loadSamples);

  useEffect(() => {
    if (!document || port === null) {
      return;
    }
    for (const r of sampleRequests(document, { baseUrl: baseUrlOverride || document.baseUrl, profiles, activeStates, globalRole })) {
      void loadSamples(r.profile, r.origin, r.lists);
    }
  }, [document, port, profiles, activeStates, globalRole, baseUrlOverride, loadSamples]);
}
