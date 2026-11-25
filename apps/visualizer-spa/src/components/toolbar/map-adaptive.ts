/**
 * Адаптив карты для настроек: текущее окно экранов и пресет, который ему соответствует.
 */
import type { DeviceViewport, LayoutHints } from '@live-app-map/schema';
import { resolveViewportPresets } from '../../lib/viewport-presets';

/** Окно карты по умолчанию и выбранный пресет. */
export type MapAdaptive = {
  readonly w: number;
  readonly h: number;
  readonly mode: 'auto' | 'fixed';
  /** Пресет того же размера; нет такого — пустая строка (в списке ничего не выбрано). */
  readonly presetId: string;
};

/**
 * Адаптив карты: общее окно из layout; без него — самый частый размер экранов карты
 * (скан пишет размер приложения в каждый экран); иначе ширина/высота layout, иначе 390×844.
 *
 * @param layout - layout карты
 * @param nodes - экраны карты
 */
export function mapAdaptive(layout: LayoutHints | undefined, nodes: readonly { readonly viewport?: DeviceViewport }[]): MapAdaptive {
  const { w, h, mode } = mapSize(layout ?? {}, commonViewport(nodes));
  const presetId = resolveViewportPresets(layout).find((p) => p.width === w && p.height === h)?.id ?? '';
  return { w, h, mode, presetId };
}

/** Самый частый размер экранов, у которых он задан. */
function commonViewport(nodes: readonly { readonly viewport?: DeviceViewport }[]): DeviceViewport | undefined {
  const count = new Map<string, { readonly v: DeviceViewport; n: number }>();
  for (const { viewport: v } of nodes) {
    if (v !== undefined) {
      const key = `${v.width}x${v.height}`;
      const c = count.get(key) ?? { v, n: 0 };
      c.n += 1;
      count.set(key, c);
    }
  }
  return [...count.values()].sort((a, b) => b.n - a.n)[0]?.v;
}

/** Размер карты: общий viewport, иначе частый размер экранов, иначе defaultWidth/Height/HeightMode, иначе 390×844. */
function mapSize(layout: LayoutHints, common: DeviceViewport | undefined): Omit<MapAdaptive, 'presetId'> {
  const d: Partial<DeviceViewport> = layout.defaultDeviceViewport ?? common ?? {};
  return {
    w: d.width ?? layout.defaultWidth ?? 390,
    h: d.height ?? layout.defaultHeight ?? 844,
    mode: d.heightMode ?? layout.defaultHeightMode ?? 'fixed',
  };
}
