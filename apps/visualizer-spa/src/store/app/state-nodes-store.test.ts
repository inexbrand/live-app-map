/**
 * Store и узлы-состояния: переключатель вида, состояния проекта, ошибка шага переживает загрузку карты.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { stateNodeId } from '../../lib/state-nodes';
import { openMap, resetStores } from '../../test/fixtures';
import { useAppStore } from '../app-store';

beforeEach(() => resetStores());

describe('узлы-состояния в store', () => {
  test('итог шагов, пришедший до загрузки карты, остаётся после неё; null — снимает подпись', () => {
    const key = stateNodeId('miniapp:route:/feed', 'filters-open');
    useAppStore.getState().setStepError(key, 'шаг 1 не выполнен: клик #x — элемент не найден за 5 с');
    openMap('korbor-miniapp');
    expect(useAppStore.getState().stepErrors.get(key)).toContain('шаг 1 не выполнен');
    useAppStore.getState().setStepError(key, null);
    expect(useAppStore.getState().stepErrors.has(key)).toBe(false);
  });

  test('состояния проекта до карты применяются при её загрузке; document остаётся без узлов-состояний', () => {
    useAppStore.getState().setShowStates(true);
    openMap('korbor-miniapp');
    const screen = useAppStore.getState().document?.nodes.find((n) => n.kind === 'page')?.id ?? '';
    useAppStore.getState().setProjectStates(new Map([[screen, [{ name: 'empty', id: 'empty', label: 'Пусто', kind: 'empty' }]]]));
    const id = stateNodeId(screen, 'empty');
    expect(useAppStore.getState().index?.nodesById.has(id)).toBe(true);
    expect(useAppStore.getState().document?.nodes.some((n) => n.id === id)).toBe(false);
    // перезагрузка той же карты сохраняет состояния проекта
    const doc = useAppStore.getState().document;
    if (doc !== null) {
      useAppStore.getState().loadDocument(doc);
    }
    expect(useAppStore.getState().index?.nodesById.has(id)).toBe(true);
    // узел-состояние попадает в бюджет живых экранов
    useAppStore.getState().selectPage(id);
    useAppStore.getState().recomputeLive();
    expect(useAppStore.getState().livePageIds.has(id)).toBe(true);
  });
});
