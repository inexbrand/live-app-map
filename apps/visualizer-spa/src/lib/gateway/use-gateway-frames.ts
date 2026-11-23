/**
 * Связь визуализатора со страницами в iframe шлюза: читает профили при
 * старте и принимает отчёты страниц (высота, 401/403) по postMessage.
 */
import { useEffect } from 'react';
import { useAppStore } from '../../store/app-store';
import { useGatewayStore } from '../../store/gateway-store';
import { isLamPageMessage } from './inject-script';
import { mapOrigins } from './map-origins';

/** Атрибут iframe с id ноды — по нему отчёт находит свою ноду. */
export const NODE_IFRAME_ATTR = 'data-lam-node-iframe';

/**
 * id ноды, чей iframe прислал сообщение.
 *
 * @param source - MessageEvent.source
 */
function nodeIdOf(source: MessageEventSource | null): string | null {
  if (source === null) {
    return null;
  }
  for (const frame of document.querySelectorAll<HTMLIFrameElement>(`iframe[${NODE_IFRAME_ATTR}]`)) {
    if (frame.contentWindow === source) {
      return frame.getAttribute(NODE_IFRAME_ATTR);
    }
  }
  return null;
}

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
    const onMessage = (e: MessageEvent) => {
      if (!isLamPageMessage(e.data)) {
        return;
      }
      const nodeId = nodeIdOf(e.source);
      if (nodeId !== null) {
        useGatewayStore.getState().setReport(nodeId, e.data);
      }
    };
    window.addEventListener('message', onMessage);
    // Порт и профили шлюза приходят позже, чем ноды узнают о своей видимости: адреса экранов
    // меняются — живые ноды пересчитываются, иначе до первого движения холста их 0.
    const unsubscribe = useGatewayStore.subscribe((s, prev) => {
      if (s.port !== prev.port || s.profiles !== prev.profiles) {
        useAppStore.getState().recomputeLive();
      }
    });
    return () => {
      window.removeEventListener('message', onMessage);
      unsubscribe();
      offDocument();
    };
  }, []);
}