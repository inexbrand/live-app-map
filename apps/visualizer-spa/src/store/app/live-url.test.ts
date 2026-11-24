/**
 * Live URL экрана через шлюз профилей: адрес шлюза с профилем, меткой приложения и
 * ячейкой ноды; реальные параметры маршрута из прочитанных образцов API.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { cellOf } from '../../lib/gateway/gateway-host';
import { useAppStore } from '../app-store';
import { useGatewayStore } from '../gateway-store';
import { openMap, resetStores } from '../../test/fixtures';
import { stateNodeId } from '../../lib/state-nodes';

beforeEach(() => resetStores());

function screen(pattern: RegExp): string {
  const n = useAppStore.getState().document?.nodes.find((x) => x.kind === 'page' && pattern.test(x.pathPattern));
  if (n === undefined) {
    throw new Error(`нет экрана ${pattern}`);
  }
  return n.id;
}

describe('live URL через шлюз', () => {
  test('экран открывается на шлюзе: профиль, метка приложения, ячейка ноды', () => {
    openMap('korbor-miniapp');
    const id = screen(/^\/$/);
    const direct = useAppStore.getState().resolveLiveUrl(id);
    useGatewayStore.setState({ port: 4320, profiles: [] });
    const url = useAppStore.getState().resolveLiveUrl(id);
    expect(direct).not.toBeNull();
    // Без сессий — анонимный профиль; метка — dev-сервер мини-аппа из карты.
    expect(url).toBe(`http://anon--s5175-vite--${cellOf(id)}.localhost:4320/#/`);
    expect(new URL(url ?? '').hash).toBe(new URL(direct ?? '').hash);
  });

  test('адрес пересобирается при смене роли, стейта, входа и образцов шлюза', () => {
    openMap('korbor-miniapp');
    const id = screen(/^\/$/);
    useGatewayStore.setState({ port: 4320, profiles: [] });
    const first = useAppStore.getState().resolveLiveUrl(id);
    useAppStore.getState().setGlobalRole('recruiter');
    const withRole = useAppStore.getState().resolveLiveUrl(id);
    expect(withRole).not.toBe(first);
    useGatewayStore.setState({ port: 4321 });
    expect(useAppStore.getState().resolveLiveUrl(id)).toContain('.localhost:4321/');
    useGatewayStore.setState({ port: null });
    useAppStore.getState().setDogfoodAdminAccessToken('tok');
    useAppStore.getState().setDogfoodMiniappInitData('init-1');
    expect(useAppStore.getState().resolveLiveUrl(id)).toContain('lam_init_data=init-1');
    useAppStore.getState().setDogfoodMiniappInitData('init-2');
    expect(useAppStore.getState().resolveLiveUrl(id)).toContain('lam_init_data=init-2');
  });

  test('узел-состояние: роль состояния, lam_state=<экран>/<состояние>; без вида «Состояния» узла нет', () => {
    openMap('korbor-miniapp');
    const id = screen(/^\/$/);
    useAppStore.getState().setShowStates(true);
    useAppStore.getState().setProjectStates(new Map([[id, [{ name: 'empty', id: 'empty', label: 'Пусто', kind: 'empty', role: 'employer' }]]]));
    const nodeId = stateNodeId(id, 'empty');
    const url = new URL(useAppStore.getState().resolveLiveUrl(nodeId) ?? 'http://нет/');
    expect(url.searchParams.get('lam_state')).toBe(`${id}/empty`);
    expect(url.searchParams.get('lam_role')).toBe('employer');
    // сам экран — без lam_state
    expect(useAppStore.getState().resolveLiveUrl(id)).not.toContain('lam_state');
    // через шлюз параметр сохраняется
    useGatewayStore.setState({ port: 4320, profiles: [] });
    expect(useAppStore.getState().resolveLiveUrl(nodeId)).toContain('lam_state=');
    useAppStore.getState().setShowStates(false);
    expect(useAppStore.getState().resolveLiveUrl(nodeId)).toBeNull();
  });

  test('сервис и неизвестный id — без URL', () => {
    openMap('korbor-miniapp');
    const service = useAppStore.getState().document?.nodes.find((n) => n.kind === 'service');
    useGatewayStore.setState({ port: 4320, profiles: [] });
    expect(useAppStore.getState().resolveLiveUrl(service?.id ?? '')).toBeNull();
    expect(useAppStore.getState().resolveLiveUrl('нет-такого')).toBeNull();
  });
});