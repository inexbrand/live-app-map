/**
 * Набор экранов трансляции из состояния карты: смонтированные экраны
 * (живые ∪ тёплые) с адресом и окном; живые — с кадрами.
 */
import { useEffect } from 'react';
import { resolveNodeViewport } from '../viewport';
import { useAppStore } from '../../store/app-store';
import type { AppStore } from '../../store/app/types';
import { useGatewayStore } from '../../store/gateway-store';
import { streamClient } from './stream-client';
import type { StreamScreen } from './stream-protocol';

/** Что нужно от store для набора. */
export type StreamSyncInput = Pick<AppStore, 'mode' | 'mountedPageIds' | 'livePageIds' | 'index' | 'nodeViewports' | 'contentHeights' | 'document' | 'resolveLiveUrl'>;

/**
 * Экраны для трансляции.
 *
 * @param s - состояние карты
 */
export function screensOf(s: StreamSyncInput): StreamScreen[] {
  if (s.mode !== 'live') {
    return [];
  }
  const out: StreamScreen[] = [];
  for (const id of [...s.mountedPageIds].sort()) {
    const url = s.resolveLiveUrl(id);
    if (url === null || url === '') {
      continue;
    }
    const v = resolveNodeViewport({
      nodeViewport: s.index?.nodesById.get(id)?.viewport,
      override: s.nodeViewports.get(id),
      layout: s.document?.layout,
      measuredHeight: s.contentHeights.get(id),
    });
    out.push({ key: id, url, width: Math.round(v.width), height: Math.round(v.height), live: s.livePageIds.has(id) });
  }
  return out;
}

/** Хук корня приложения: набор экранов уходит серверу при каждом изменении карты или шлюза. */
export function useStreamSync(): void {
  useEffect(() => {
    const push = (): void => streamClient.sync(screensOf(useAppStore.getState()));
    push();
    const offApp = useAppStore.subscribe(push);
    // Порт и профили шлюза входят в адреса экранов
    const offGateway = useGatewayStore.subscribe(push);
    return () => {
      offApp();
      offGateway();
    };
  }, []);
}
