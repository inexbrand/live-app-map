/**
 * Связь визуализатора со страницами шлюза: читает профили при старте и
 * принимает отчёты страниц (высота, 401/403) через трансляцию.
 */
import { useEffect } from 'react';
import { useAppStore } from '../../store/app-store';
import { useGatewayStore } from '../../store/gateway-store';
import { streamClient } from '../stream/stream-client';
import { isLamPageMessage } from './inject-script';
import { mapOrigins } from './map-origins';

/** Автовход для открытой карты: роли её приложений становятся профилями входа. */
function autoLoginFor(document: ReturnType<typeof useAppStore.getState>['document']): void {
  if (document !== null) {
    void useGatewayStore.getState().autoLogin(mapOrigins(document.nodes));
  }
}

/** Хук: подключить один раз в корне приложения. */
export function useGatewayFrames(): void {
  useEffect(() => {
    void useGatewayStore.getState().refresh();
    // Карта открылась или сменилась — шлюз сам спрашивает роли у её приложений.
    autoLoginFor(useAppStore.getState().document);
    const offDocument = useAppStore.subscribe((s, prev) => {
      if (s.document !== prev.document) {
        autoLoginFor(s.document);
      }
    });
    const offPages = streamClient.onPageMessage((nodeId, data) => {
      if (isLamPageMessage(data)) {
        useGatewayStore.getState().setReport(nodeId, data);
      }
    });
    // Порт и профили шлюза приходят позже, чем ноды узнают о своей видимости: адреса экранов
    // меняются — живые ноды пересчитываются, иначе до первого движения холста их 0.
    const unsubscribe = useGatewayStore.subscribe((s, prev) => {
      if (s.port !== prev.port || s.profiles !== prev.profiles) {
        useAppStore.getState().recomputeLive();
      }
    });
    return () => {
      offPages();
      unsubscribe();
      offDocument();
    };
  }, []);
}