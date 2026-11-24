/**
 * Общие данные и сброс состояния для тестов компонентов: настоящие карты (срезы карт korbor
 * в test-fixtures/maps корня и карта live-app-map из public/maps), store в начальном состоянии,
 * ответы сети по адресу.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { liveAppMapToAppMap, parseLiveAppMapDocument, type AppMapDocument, type DocEpoch } from '@live-app-map/schema';
import { useAppStore } from '../store/app-store';
import { useCommentsStore } from '../store/comments-store';
import { useDocGraphStore } from '../store/doc-graph-store';
import { useGatewayStore } from '../store/gateway-store';
import { useMapSourceStore } from '../store/map-source-store';
import { useSnapshotStore } from '../store/snapshot-store';
import { useUiStore } from '../store/ui-store';
import { useViewStore } from '../store/view-store';
import { useVoiceStore } from '../store/voice-store';

/**
 * Карта для тестов: срезы настоящих карт korbor (test-fixtures/maps — все экраны и рёбра, часть
 * роутов, таблиц, символов и документов) и карта самого live-app-map (public/maps).
 */
export type MapName = 'korbor-miniapp' | 'korbor-site' | 'korbor-admin' | 'korbor-all' | 'live-app-map';

/**
 * Файл карты для тестов.
 *
 * @param name - карта
 * @returns абсолютный путь
 */
export function testMapPath(name: MapName): string {
  const rel = name === 'live-app-map' ? '../../public/maps/live-app-map.liveappmap.json' : `../../../../test-fixtures/maps/${name}.liveappmap.json`;
  return fileURLToPath(new URL(rel, import.meta.url));
}

const rawCache = new Map<MapName, string>();

/** Текст файла карты (кэш на прогон). */
export function mapText(name: MapName): string {
  const hit = rawCache.get(name);
  if (hit !== undefined) {
    return hit;
  }
  const text = readFileSync(testMapPath(name), 'utf8');
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

/** Тестовая незакрытая эпоха: в korbor эпохи закрываются, а сценарию нужна открытая. */
export const OPEN_EPOCH_DIR = 'docs/epoch/test-open-task#20991231-235959';

/** Открытые пункты тестовой эпохи — больше пяти, чтобы была кнопка «ещё». */
export const OPEN_EPOCH_BUGS = ['Первый пункт', 'Второй пункт', 'Третий пункт', 'Четвёртый пункт', 'Пятый пункт', 'Шестой пункт', 'Седьмой пункт'];

/**
 * Карта с тестовой незакрытой эпохой первой (эпохи — от новых к старым).
 *
 * @param doc - карта
 */
export function withOpenEpoch(doc: AppMapDocument): AppMapDocument {
  const docs = doc.docs;
  if (docs === undefined) {
    throw new Error('в карте нет docs');
  }
  const dir = OPEN_EPOCH_DIR;
  const bugs = `# Найденные баги\n\n## Open\n\n${OPEN_EPOCH_BUGS.map((b) => `- [ ] ${b}`).join('\n')}\n\n## Closed\n`;
  const epoch: DocEpoch = {
    id: dir.slice('docs/epoch/'.length),
    slug: 'test-open-task',
    date: '2099-12-31T23:59:59',
    dir,
    summary: 'Тестовая незакрытая задача.',
    readiness: 'not-ready',
    openBugs: OPEN_EPOCH_BUGS,
    files: [
      { path: `${dir}/00-brief.md`, title: 'Brief', text: '# Brief\n\n## Цель\n\nТестовая незакрытая задача.\n' },
      { path: `${dir}/09-bugs.md`, title: 'Найденные баги', text: bugs },
    ],
    images: [],
  };
  return { ...doc, docs: { ...docs, epochs: [epoch, ...docs.epochs] } };
}

/** Загрузить карту с тестовой незакрытой эпохой. */
export function openMapWithOpenEpoch(name: MapName): AppMapDocument {
  const doc = withOpenEpoch(appMap(name));
  useAppStore.getState().loadDocument(doc);
  return doc;
}

/**
 * Загрузить карту, где у первого роута убраны JSDoc и комментарии — роут без авторского описания.
 *
 * @returns id этого роута
 */
export function openMapWithUndocumentedRoute(name: MapName): string {
  const doc = appMap(name);
  const routes = doc.code?.routes ?? [];
  const first = routes[0];
  if (doc.code === undefined || first === undefined) {
    throw new Error(`в карте ${name} нет роутов`);
  }
  const { doc: _doc, comments: _comments, ...bare } = first;
  useAppStore.getState().loadDocument({ ...doc, code: { ...doc.code, routes: [bare, ...routes.slice(1)] } });
  return first.id;
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
