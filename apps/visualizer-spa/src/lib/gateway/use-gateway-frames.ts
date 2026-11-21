/**
 * Связь визуализатора со страницами в iframe шлюза: читает профили при
 * старте и принимает отчёты страниц (высота, 401/403) по postMessage.
 */
import { useEffect } from 'react';
import { useGatewayStore } from '../../store/gateway-store';
import { isLamPageMessage } from './inject-script';

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

/** Хук: подключить один раз в корне приложения. */
export function useGatewayFrames(): void {
  useEffect(() => {
    void useGatewayStore.getState().refresh();
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
    return () => window.removeEventListener('message', onMessage);
  }, []);
}
