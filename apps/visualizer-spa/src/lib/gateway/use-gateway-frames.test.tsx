/**
 * Отчёты страниц шлюза: сообщение страницы экрана о высоте приходит через
 * трансляцию и попадает в store шлюза этой ноды; чужие сообщения — мимо;
 * смена порта шлюза пересчитывает живые ноды.
 */
import { useDom } from '../../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, render } from '@testing-library/react';
import { useAppStore } from '../../store/app-store';
import { useGatewayStore } from '../../store/gateway-store';
import { startFakeStream, type FakeStream } from '../../test/fake-stream';
import { resetStores } from '../../test/fixtures';
import { useGatewayFrames } from './use-gateway-frames';

useDom();

const realFetch = globalThis.fetch;
let stream: FakeStream;
beforeEach(() => {
  resetStores();
  stream = startFakeStream();
  // Порт и профили шлюза: dev-сервера нет — ответ как у /__lam_sessions
  globalThis.fetch = Object.assign(async () => Response.json({ ok: true, gatewayPort: 4320, profiles: [] }), { preconnect: realFetch.preconnect });
});
afterEach(() => {
  stream.stop();
  globalThis.fetch = realFetch;
});

function Host() {
  useGatewayFrames();
  return null;
}

const page = { lam: 'page', href: 'http://x/', contentHeight: 1200, viewportHeight: 700 };

describe('useGatewayFrames', () => {
  test('отчёт страницы экрана — в store шлюза под id ноды; не отчёт — мимо', async () => {
    render(<Host />);
    await stream.page('page:/feed', page);
    await stream.page('page:/feed', { lam: 'ping' });
    await stream.page('page:/other', { lam: 'чужое', contentHeight: 1 });
    await act(async () => {
      await Bun.sleep(50);
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