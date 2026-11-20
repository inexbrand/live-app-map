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
  const id = s.selectedPageId;
  const node = id === null ? undefined : s.index?.nodesById.get(id);
  return {
    mapName: doc?.project.name ?? null,
    baseUrl: s.baseUrlOverride !== '' ? s.baseUrlOverride : (doc?.baseUrl ?? null),
    mode: s.mode,
    role: s.globalRole,
    pageCount: doc?.nodes.filter((n) => n.kind === 'page').length ?? 0,
    selected:
      id === null || node === undefined
        ? null
        : {
            id,
            title: node.title,
            path: node.pathExample ?? node.pathPattern,
            url: s.resolveLiveUrl(id),
            stateName: s.activeStates.get(id) ?? null,
          },
  };
}

/**
 * Мост к агенту (публикация + опрос). Вызывать один раз — в LamGrabHost.
 */
export function useAgentBridge(): void {
  const enabledRef = useRef(true);
  const handledRef = useRef(new Set<string>());

  useEffect(() => {
    let lastKey = '';
    let timer: number | undefined;
    const publish = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!enabledRef.current) {
          return;
        }
        const state = buildVisualizerState(selectVisualizerInput(useAppStore.getState()), new Date());
        const key = visualizerStateKey(state);
        if (key !== lastKey) {
          lastKey = key;
          void publishVisualizerState(state);
        }
      }, PUBLISH_DEBOUNCE_MS);
    };
    publish();
    const unsubscribe = useAppStore.subscribe(publish);
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    const tick = async (): Promise<void> => {
      const res = await pollAgentRequest();
      if (stopped) {
        return;
      }
      if (!res.ok && res.unavailable) {
        enabledRef.current = false;
        return;
      }
      const request = res.ok ? res.request : null;
      // Просьба ждёт открытой карты: оверлей выделения живёт на холсте
      if (request !== null && !handledRef.current.has(request.id) && useAppStore.getState().document !== null) {
        if (useSnapshotStore.getState().request({ kind: 'agent', requestId: request.id, note: request.note })) {
          handledRef.current.add(request.id);
        }
      }
      timer = window.setTimeout(() => void tick(), AGENT_POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, []);
}
