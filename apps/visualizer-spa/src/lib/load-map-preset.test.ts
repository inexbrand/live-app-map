/**
 * Выбор карты: fetch → baseUrl override → документ в настоящем store.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { useAppStore } from '../store/app-store';
import { loadMapPresetIntoStore, type MapPresetStoreActions } from './load-map-preset';

const sitePath = path.resolve(import.meta.dir, '../../public/maps/korbor-site.liveappmap.json');

function fakeFetch(status: number, body: string): typeof fetch {
  const fn = async (): Promise<Response> => new Response(body, { status });
  return Object.assign(fn, { preconnect: fetch.preconnect });
}

const storeActions: MapPresetStoreActions = {
  setBaseUrlOverride: (url) => useAppStore.getState().setBaseUrlOverride(url),
  loadUnknownJson: (json) => useAppStore.getState().loadUnknownJson(json),
  setMode: (mode) => useAppStore.getState().setMode(mode),
};

const source = { path: '/maps/korbor-site.liveappmap.json', baseUrl: 'http://localhost:16001' };

describe('loadMapPresetIntoStore', () => {
  beforeEach(() => {
    useAppStore.getState().clearMap();
    useAppStore.getState().setBaseUrlOverride('');
  });

  test('карта загружается в store, baseUrl и режим live выставлены', async () => {
    const res = await loadMapPresetIntoStore(source, storeActions, fakeFetch(200, readFileSync(sitePath, 'utf8')));
    expect(res.ok).toBe(true);
    const s = useAppStore.getState();
    expect(s.baseUrlOverride).toBe('http://localhost:16001');
    expect(s.mode).toBe('live');
    expect(s.document?.nodes.filter((n) => n.kind === 'page').length).toBe(35);
  });

  test('HTTP 404 — ошибка, store не тронут', async () => {
    const res = await loadMapPresetIntoStore(source, storeActions, fakeFetch(404, ''));
    expect(res).toEqual({ ok: false, error: 'Не удалось загрузить /maps/korbor-site.liveappmap.json: HTTP 404' });
    expect(useAppStore.getState().document).toBeNull();
    expect(useAppStore.getState().baseUrlOverride).toBe('');
  });

  test('JSON не карта — ok:false, режим не переключается', async () => {
    const modes: string[] = [];
    const res = await loadMapPresetIntoStore(
      source,
      { ...storeActions, setMode: (m) => modes.push(m) },
      fakeFetch(200, '{"hello":1}'),
    );
    expect(res).toEqual({ ok: false, error: 'Карта /maps/korbor-site.liveappmap.json не разобрана' });
    expect(useAppStore.getState().document).toBeNull();
    expect(modes).toEqual([]);
    expect(useAppStore.getState().lastLoadError).toContain('Не удалось разобрать JSON');
  });
});
