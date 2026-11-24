/**
 * Адрес снимка ноды — общий для браузера и dev-сервера (без node-модулей).
 */
import type { AppMapStateStep } from '@live-app-map/schema';

/** Путь эндпоинта снимков. */
export const SNAPSHOT_PATH = '/__lam_snapshot';

/**
 * Адрес снимка для ноды.
 *
 * @param gatewayUrl - адрес страницы через шлюз
 * @param width - ширина окна
 * @param height - высота окна
 * @param steps - шаги состояния до снимка (узел-состояние); нет — снимок сразу после загрузки
 */
export function snapshotSrc(gatewayUrl: string, width: number, height: number, steps: readonly AppMapStateStep[] = []): string {
  const q = new URLSearchParams({ url: gatewayUrl, w: String(width), h: String(height) });
  if (steps.length > 0) {
    q.set('steps', JSON.stringify(steps));
  }
  return `${SNAPSHOT_PATH}?${q.toString()}`;
}
