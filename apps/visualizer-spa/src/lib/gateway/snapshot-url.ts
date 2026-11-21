/**
 * Адрес снимка ноды — общий для браузера и dev-сервера (без node-модулей).
 */

/** Путь эндпоинта снимков. */
export const SNAPSHOT_PATH = '/__lam_snapshot';

/**
 * Адрес снимка для ноды.
 *
 * @param gatewayUrl - адрес страницы через шлюз
 * @param width - ширина окна
 * @param height - высота окна
 */
export function snapshotSrc(gatewayUrl: string, width: number, height: number): string {
  const q = new URLSearchParams({ url: gatewayUrl, w: String(width), h: String(height) });
  return `${SNAPSHOT_PATH}?${q.toString()}`;
}
