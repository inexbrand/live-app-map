/**
 * Live URL экрана через шлюз профилей: адрес шлюза с профилем, меткой приложения и
 * ячейкой ноды; реальные параметры маршрута из прочитанных образцов API.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { cellOf } from '../../lib/gateway/gateway-host';
import { useAppStore } from '../app-store';
import { useGatewayStore } from '../gateway-store';
import { openMap, resetStores } from '../../test/fixtures';

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

  test('сервис и неизвестный id — без URL', () => {
    openMap('korbor-miniapp');
    const service = useAppStore.getState().document?.nodes.find((n) => n.kind === 'service');
    useGatewayStore.setState({ port: 4320, profiles: [] });
    expect(useAppStore.getState().resolveLiveUrl(service?.id ?? '')).toBeNull();
    expect(useAppStore.getState().resolveLiveUrl('нет-такого')).toBeNull();
  });
});