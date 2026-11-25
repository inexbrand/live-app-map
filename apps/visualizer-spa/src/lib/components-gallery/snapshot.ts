/**
 * Снимок варианта, который не транслируется (вне живых): тот же сервис снимков,
 * что у замороженных экранов карты (/__lam_snapshot, только адреса шлюза).
 */
import { ANON_PROFILE, cellOf, toGatewayUrl } from '../gateway/gateway-host';
import { snapshotSrc } from '../gateway/snapshot-url';
import type { GalleryItem } from './gallery';
import { COMPONENT_VIEWPORT } from './stream-screens';

/**
 * Адрес снимка варианта: страница компонента через шлюз без сессии, своя ячейка на узел.
 *
 * @param item - вариант галереи
 * @param gatewayPort - порт шлюза; null — шлюз не поднят
 * @returns адрес /__lam_snapshot или null
 */
export function componentSnapshotSrc(item: GalleryItem, gatewayPort: number | null): string | null {
  if (gatewayPort === null) {
    return null;
  }
  const url = toGatewayUrl(item.url, ANON_PROFILE, gatewayPort, cellOf(item.id));
  return url === null ? null : snapshotSrc(url, COMPONENT_VIEWPORT.width, COMPONENT_VIEWPORT.height);
}
