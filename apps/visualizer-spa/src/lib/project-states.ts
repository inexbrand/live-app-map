/**
 * Состояния экранов из проекта: `GET /__lam_project/states` отдаёт экспорт screens
 * из `<проект>/.live-app-map/states.ts` (`{ screens: { "<id экрана>": LamScreenState[] } }`).
 * Они главнее состояний в карте (слияние — lib/state-nodes.ts). Проект не открыт — 404, состояний нет.
 */
import { appMapPageStateSchema } from '@live-app-map/schema';
import { useEffect } from 'react';
import { z } from 'zod';
import { useAppStore } from '../store/app-store';
import type { ProjectScreenStates } from './state-nodes';

/** Путь эндпоинта состояний проекта. */
export const PROJECT_STATES_PATH = '/__lam_project/states';

const bodySchema = z.object({ screens: z.record(z.array(appMapPageStateSchema)) });

/** Итог чтения: состояния, «проекта нет» или текст ошибки. */
export type ProjectStatesResult =
  | { readonly kind: 'ok'; readonly states: ProjectScreenStates }
  | { readonly kind: 'none' }
  | { readonly kind: 'error'; readonly message: string };

/**
 * Разбор ответа эндпоинта.
 *
 * @param status - HTTP-статус
 * @param body - JSON ответа
 */
export function parseProjectStates(status: number, body: unknown): ProjectStatesResult {
  if (status === 404) {
    return { kind: 'none' };
  }
  const errorText = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string' ? body.error : null;
  if (status !== 200) {
    return { kind: 'error', message: `states.ts проекта не прочитан (${status})${errorText === null ? '' : `: ${errorText}`}` };
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { kind: 'error', message: `states.ts проекта: ${issue === undefined ? 'неверный формат' : `${issue.path.join('.')} — ${issue.message}`}` };
  }
  return { kind: 'ok', states: new Map(Object.entries(parsed.data.screens)) };
}

/**
 * Прочитать состояния проекта у dev-сервера.
 *
 * @param fetchImpl - fetch (в тестах — свой)
 */
export async function fetchProjectStates(fetchImpl: (path: string) => Promise<Response> = (p) => fetch(p)): Promise<ProjectStatesResult> {
  const res = await fetchImpl(PROJECT_STATES_PATH);
  // Без эндпоинта vite отдаёт index.html — это «проекта нет», а не ошибка
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  if (!isJson) {
    return res.status === 200 || res.status === 404 ? { kind: 'none' } : { kind: 'error', message: `states.ts проекта не прочитан (${res.status})` };
  }
  return parseProjectStates(res.status, await res.json());
}

/** Хук корня: состояния проекта при старте; ошибка — в журнал и всплывающее сообщение. */
export function useProjectStates(): void {
  useEffect(() => {
    let alive = true;
    void fetchProjectStates()
      .catch((err: unknown): ProjectStatesResult => ({ kind: 'error', message: `states.ts проекта не прочитан: ${err instanceof Error ? err.message : String(err)}` }))
      .then((r) => {
        if (!alive) {
          return;
        }
        const store = useAppStore.getState();
        if (r.kind === 'ok') {
          store.setProjectStates(r.states);
          store.pushLog({ level: 'info', source: 'system', message: `Состояния проекта: ${[...r.states.values()].reduce((n, s) => n + s.length, 0)} у ${r.states.size} экранов` });
        }
        if (r.kind === 'error') {
          store.pushLog({ level: 'error', source: 'system', message: r.message });
          store.setToast(r.message);
        }
      });
    return () => {
      alive = false;
    };
  }, []);
}
