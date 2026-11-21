/**
 * Загружает реальные значения параметров маршрутов экранов карты под их
 * профилями: группирует списки API по профилю и origin приложения.
 */
import { resolveNodeUrl } from '@live-app-map/graph';
import { useEffect } from 'react';
import { ANON_PROFILE } from './gateway/gateway-host';
import { pickNodeProfile } from './gateway/profile-pick';
import { nodeSampleLists } from './route-samples';
import { useAppStore } from '../store/app-store';
import { useGatewayStore } from '../store/gateway-store';

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
    const groups = new Map<string, { profile: string; origin: string; lists: Set<string> }>();
    for (const node of document.nodes) {
      const lists = nodeSampleLists(document, node);
      const url = lists.length === 0 ? null : resolveNodeUrl(node, baseUrlOverride || document.baseUrl);
      if (url === null) {
        continue;
      }
      const origin = new URL(url).origin;
      const profile = pickNodeProfile(node, { profiles, appOrigin: origin, stateName: activeStates.get(node.id), globalRole });
      if (profile === ANON_PROFILE) {
        continue;
      }
      const key = `${profile}|${origin}`;
      const g = groups.get(key) ?? { profile, origin, lists: new Set<string>() };
      lists.forEach((l) => g.lists.add(l));
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      void loadSamples(g.profile, g.origin, [...g.lists]);
    }
  }, [document, port, profiles, activeStates, globalRole, baseUrlOverride, loadSamples]);
}
