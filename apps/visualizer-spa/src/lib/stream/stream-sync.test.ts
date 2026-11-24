import { describe, expect, test } from 'bun:test';
import { indexDocument } from '@live-app-map/graph';
import type { AppMapDocument } from '@live-app-map/schema';
import { useAppStore } from '../../store/app-store';
import { screensOf, type StreamSyncInput } from './stream-sync';

const base = useAppStore.getInitialState();

function doc(): AppMapDocument {
  return {
    version: 1,
    project: { name: 't', root: '.' },
    baseUrl: null,
    nodes: [
      { id: 'a', kind: 'page', title: 'a', pathPattern: '/a', viewport: { width: 1920, height: 1080, heightMode: 'fixed' } },
      { id: 'b', kind: 'page', title: 'b', pathPattern: '/b' },
      { id: 'c', kind: 'page', title: 'c', pathPattern: '/c' },
    ],
    edges: [],
  } as unknown as AppMapDocument;
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
