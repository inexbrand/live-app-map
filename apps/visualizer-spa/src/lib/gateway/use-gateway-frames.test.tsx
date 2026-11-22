/**
 * Отчёты страниц шлюза: сообщение iframe ноды о высоте попадает в store шлюза
 * этой ноды; чужие сообщения и окна без ноды — мимо; смена порта шлюза
 * пересчитывает живые ноды.
 */
import { useDom } from '../../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, render } from '@testing-library/react';
import { useAppStore } from '../../store/app-store';
import { useGatewayStore } from '../../store/gateway-store';
import { resetStores } from '../../test/fixtures';
import { NODE_IFRAME_ATTR, useGatewayFrames } from './use-gateway-frames';

useDom();

const realFetch = globalThis.fetch;
beforeEach(() => {
  resetStores();
  // Порт и профили шлюза: dev-сервера нет — ответ как у /__lam_sessions
  globalThis.fetch = Object.assign(async () => Response.json({ ok: true, gatewayPort: 4320, profiles: [] }), { preconnect: realFetch.preconnect });
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function Host() {
  useGatewayFrames();
  return <iframe title="экран" {...{ [NODE_IFRAME_ATTR]: 'page:/feed' }} />;
}

const page = { lam: 'page', href: 'http://x/', contentHeight: 1200, viewportHeight: 700 };

describe('useGatewayFrames', () => {
  test('отчёт iframe ноды — в store шлюза под id ноды', async () => {
    const r = render(<Host />);
    // Окно страницы в iframe: happy-dom страницы не грузит — источник сообщения задаётся явно
    const pageWindow = new MessageChannel().port1;
    const frame = r.container.querySelector('iframe');
    if (frame !== null) {
      Object.defineProperty(frame, 'contentWindow', { value: pageWindow });
    }
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: page, source: pageWindow }));
      window.dispatchEvent(new MessageEvent('message', { data: { ...page, contentHeight: 1 }, source: window }));
      window.dispatchEvent(new MessageEvent('message', { data: { ...page, contentHeight: 2 }, source: null }));
      window.dispatchEvent(new MessageEvent('message', { data: { lam: 'ping' }, source: pageWindow }));
    });
    expect(useGatewayStore.getState().reports.get('page:/feed')).toMatchObject({ contentHeight: 1200 });
    expect(useGatewayStore.getState().reports.size).toBe(1);
  });

  test('порт шлюза пришёл — живые ноды пересчитаны; после размонтирования — нет', async () => {
    let recomputed = 0;
    const real = useAppStore.getState().recomputeLive;
    useAppStore.setState({ recomputeLive: () => { recomputed += 1; real(); } });
    const r = render(<Host />);
    await act(async () => {
      await Bun.sleep(20);
    });
    expect(useGatewayStore.getState().port).toBe(4320);
    expect(recomputed).toBeGreaterThan(0);
    r.unmount();
    const before = recomputed;
    act(() => useGatewayStore.setState({ port: 4321 }));
    expect(recomputed).toBe(before);
  });
});