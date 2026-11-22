/**
 * Публикует агенту, что открыто в визуализаторе, и принимает его
 * просьбы снимка (опрос /api/agent-state). Без dev-сервера выключается.
 */
import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/app-store';
import { useSnapshotStore } from '../store/snapshot-store';
import {
  buildVisualizerState,
  pollAgentRequest,
  publishVisualizerState,
  visualizerStateKey,
  type VisualizerStateInput,
} from './agent-bridge';

/** Пауза между опросами просьб агента. */
export const AGENT_POLL_MS = 3000;

/** Задержка публикации после изменения store. */
export const PUBLISH_DEBOUNCE_MS = 400;

type AppState = ReturnType<typeof useAppStore.getState>;

/**
 * Выжимка store для агента.
 *
 * @param s - состояние app-store
 */
export function selectVisualizerInput(s: AppState): VisualizerStateInput {
  const doc = s.document;
  return {
    mapName: doc?.project.name ?? null,
    baseUrl: s.baseUrlOverride !== '' ? s.baseUrlOverride : (doc?.baseUrl ?? null),
    mode: s.mode,
    role: s.globalRole,
    pageCount: doc?.nodes.filter((n) => n.kind === 'page').length ?? 0,
    selected: selectedOf(s),
  };
}

/** Выбранный экран для агента; нет выбора или ноды — null. */
function selectedOf(s: AppState): VisualizerStateInput['selected'] {
  const id = s.selectedPageId;
  const node = id === null ? undefined : s.index?.nodesById.get(id);
  if (id === null || node === undefined) {
    return null;
  }
  return {
    id,
    title: node.title,
    path: node.pathExample ?? node.pathPattern,
    url: s.resolveLiveUrl(id),
    stateName: s.activeStates.get(id) ?? null,
  };
}

type Flag = { current: boolean };

/** Публикация состояния после паузы и только при изменении; возвращает отписку. */
function startPublishing(enabled: Flag): () => void {
  let lastKey = '';
  let timer: number | undefined;
  const flush = (): void => {
    if (!enabled.current) {
      return;
    }
    const state = buildVisualizerState(selectVisualizerInput(useAppStore.getState()), new Date());
    const key = visualizerStateKey(state);
    if (key !== lastKey) {
      lastKey = key;
      void publishVisualizerState(state);
    }
  };
  const publish = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, PUBLISH_DEBOUNCE_MS);
  };
  publish();
  const unsubscribe = useAppStore.subscribe(publish);
  return () => {
    unsubscribe();
    window.clearTimeout(timer);
  };
}

/** Просьба агента становится сессией снимка, когда карта открыта; каждая — один раз. */
function takeRequest(request: { readonly id: string; readonly note: string | null } | null, handled: Set<string>): void {
  // Просьба ждёт открытой карты: оверлей выделения живёт на холсте
  if (request === null || handled.has(request.id) || useAppStore.getState().document === null) {
    return;
  }
  if (useSnapshotStore.getState().request({ kind: 'agent', requestId: request.id, note: request.note })) {
    handled.add(request.id);
  }
}

/** Опрос просьб агента; без dev-сервера выключает и публикацию. Возвращает остановку. */
function startPolling(enabled: Flag, handled: Set<string>): () => void {
  let stopped = false;
  let timer: number | undefined;
  const tick = async (): Promise<void> => {
    const res = await pollAgentRequest();
    if (stopped) {
      return;
    }
    if (!res.ok && res.unavailable) {
      enabled.current = false;
      return;
    }
    takeRequest(res.ok ? res.request : null, handled);
    timer = window.setTimeout(() => void tick(), AGENT_POLL_MS);
  };
  void tick();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}

/**
 * Мост к агенту (публикация + опрос). Вызывать один раз — в LamGrabHost.
 */
export function useAgentBridge(): void {
  const enabledRef = useRef(true);
  const handledRef = useRef(new Set<string>());
  useEffect(() => startPublishing(enabledRef), []);
  useEffect(() => startPolling(enabledRef, handledRef.current), []);
}
