/**
 * Общие данные и сброс состояния для тестов компонентов: настоящие карты из public/maps,
 * store в начальном состоянии, ответы сети по адресу.
 */
import { readFileSync } from 'node:fs';
import { liveAppMapToAppMap, parseLiveAppMapDocument, type AppMapDocument } from '@live-app-map/schema';
import { useAppStore } from '../store/app-store';
import { useCommentsStore } from '../store/comments-store';
import { useDocGraphStore } from '../store/doc-graph-store';
import { useGatewayStore } from '../store/gateway-store';
import { useMapSourceStore } from '../store/map-source-store';
import { useSnapshotStore } from '../store/snapshot-store';
import { useUiStore } from '../store/ui-store';
import { useViewStore } from '../store/view-store';
import { useVoiceStore } from '../store/voice-store';

/** Карта из public/maps. */
export type MapName = 'korbor-miniapp' | 'korbor-site' | 'korbor-admin' | 'live-app-map';

const rawCache = new Map<MapName, string>();

/** Текст файла карты (кэш на прогон). */
export function mapText(name: MapName): string {
  const hit = rawCache.get(name);
  if (hit !== undefined) {
    return hit;
  }
  const text = readFileSync(new URL(`../../public/maps/${name}.liveappmap.json`, import.meta.url), 'utf8');
  rawCache.set(name, text);
  return text;
}

/** JSON карты, как его отдаёт сервер. */
export function mapJson(name: MapName): unknown {
  return JSON.parse(mapText(name));
}

/** Карта в формате store. */
export function appMap(name: MapName): AppMapDocument {
  const parsed = parseLiveAppMapDocument(mapJson(name));
  if (!parsed.ok) {
    throw new Error(`карта ${name} не разобралась`);
  }
  return liveAppMapToAppMap(parsed.document);
}

/** Store zustand, который умеет вернуться к начальному состоянию. */
type Resettable<T> = { readonly setState: (state: T, replace: true) => void; readonly getInitialState: () => T };

function reset<T>(store: Resettable<T>): void {
  store.setState(store.getInitialState(), true);
}

/** Все store визуализатора — в начальное состояние. */
export function resetStores(): void {
  reset(useAppStore);
  reset(useViewStore);
  reset(useUiStore);
  reset(useMapSourceStore);
  reset(useCommentsStore);
  reset(useDocGraphStore);
  reset(useGatewayStore);
  reset(useSnapshotStore);
  reset(useVoiceStore);
}

/** Загрузить карту в store, как после выбора в шапке. */
export function openMap(name: MapName): AppMapDocument {
  const doc = appMap(name);
  useAppStore.getState().loadDocument(doc);
  return doc;
}

/** Ответ сети в тесте: JSON с кодом. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Обработчик запроса теста: адрес → ответ (или undefined — 404). */
export type FetchRoute = (url: string, init: RequestInit | undefined) => Response | Promise<Response> | undefined;

/** Запросы, которые сделал код под тестом. */
export type FetchLog = { readonly url: string; readonly method: string; readonly body: string | null }[];

/**
 * Подменяет сеть на время теста: fetch отвечает обработчиком, остальное — 404.
 *
 * @returns журнал запросов и функция возврата настоящего fetch
 */
export function stubFetch(route: FetchRoute): { readonly calls: FetchLog; readonly restore: () => void } {
  const previous = globalThis.fetch;
  const calls: FetchLog = [];
  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : null });
    const res = await route(url, init);
    return res ?? new Response('not found', { status: 404 });
  };
  globalThis.fetch = Object.assign(fake, { preconnect: previous.preconnect });
  return { calls, restore: () => { globalThis.fetch = previous; } };
}
