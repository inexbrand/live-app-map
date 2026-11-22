/**
 * Адаптив карты для настроек: текущее окно по умолчанию и пресет, который ему соответствует.
 */
import type { LayoutHints } from '@live-app-map/schema';
import { resolveViewportPresets } from '../../lib/viewport-presets';

/** Окно карты по умолчанию и выбранный пресет. */
export type MapAdaptive = {
  readonly w: number;
  readonly h: number;
  readonly mode: 'auto' | 'fixed';
  /** Пресет того же размера; нет такого — w390. */
  readonly presetId: string;
};

/**
 * Адаптив карты: окно устройства из layout, иначе ширина/высота layout, иначе 390×844 fixed.
 *
 * @param layout - layout карты
 */
export function mapAdaptive(layout: LayoutHints | undefined): MapAdaptive {
  const { w, h, mode } = mapSize(layout ?? {});
  const presetId = resolveViewportPresets(layout).find((p) => p.width === w && p.height === h)?.id ?? 'w390';
  return { w, h, mode, presetId };
}

/** Размер карты: общий viewport, иначе defaultWidth/Height/HeightMode, иначе iPhone 390×844. */
function mapSize(layout: LayoutHints): Omit<MapAdaptive, 'presetId'> {
  const d: Partial<NonNullable<LayoutHints['defaultDeviceViewport']>> = layout.defaultDeviceViewport ?? {};
  return {
    w: d.width ?? layout.defaultWidth ?? 390,
    h: d.height ?? layout.defaultHeight ?? 844,
    mode: d.heightMode ?? layout.defaultHeightMode ?? 'fixed',
  };
}