import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { indexDocument } from '@live-app-map/graph';
import { liveAppMapToAppMap, parseLiveAppMapDocument, type AppMapDocument } from '@live-app-map/schema';
import { useAppStore } from '../../store/app-store';
import { screensOf, type StreamSyncInput } from './stream-sync';

const base = useAppStore.getInitialState();

/** Настоящая карта мини-аппа с подменёнными экранами. */
function doc(): AppMapDocument {
  const parsed = parseLiveAppMapDocument(JSON.parse(readFileSync(new URL('../../../public/maps/korbor-miniapp.liveappmap.json', import.meta.url), 'utf8')));
  if (!parsed.ok) {
    throw new Error('карта korbor-miniapp не разобралась');
  }
  const real = liveAppMapToAppMap(parsed.document);
  return {
    ...real,
    baseUrl: null,
    layout: { ...real.layout, defaultDeviceViewport: undefined },
    nodes: [
      { id: 'a', kind: 'page', title: 'a', pathPattern: '/a', viewport: { width: 1920, height: 1080, heightMode: 'fixed' } },
      { id: 'b', kind: 'page', title: 'b', pathPattern: '/b' },
      { id: 'c', kind: 'page', title: 'c', pathPattern: '/c' },
    ],
    edges: [],
  };
}

function input(over: Partial<StreamSyncInput>): StreamSyncInput {
  const d = doc();
  return {
    mode: 'live',
    mountedPageIds: new Set(['a', 'b']),
    livePageIds: new Set(['a']),
    index: indexDocument(d),
    nodeViewports: new Map(),
    contentHeights: new Map(),
    document: d,
    resolveLiveUrl: (id) => (id === 'c' ? null : `http://x.localhost/${id}`),
    ...over,
  };
}

describe('набор экранов трансляции', () => {
  test('смонтированные с адресом и окном; живые — с кадрами, тёплые — без', () => {
    expect(screensOf(input({}))).toEqual([
      { key: 'a', url: 'http://x.localhost/a', width: 1920, height: 1080, live: true },
      { key: 'b', url: 'http://x.localhost/b', width: 390, height: 844, live: false },
    ]);
  });

  test('правка окна пользователем и экран без адреса', () => {
    const out = screensOf(input({ mountedPageIds: new Set(['b', 'c']), nodeViewports: new Map([['b', { width: 768, height: 1024, heightMode: 'fixed' }]]) }));
    expect(out.map((s) => [s.key, s.width, s.height])).toEqual([['b', 768, 1024]]);
  });

  test('не живой режим — пусто', () => {
    expect(screensOf(input({ mode: 'map-only' }))).toEqual([]);
    expect(base.mode).toBe('live');
  });
});
