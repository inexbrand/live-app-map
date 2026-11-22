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
  const w = layout?.defaultDeviceViewport?.width ?? layout?.defaultWidth ?? 390;
  const h = layout?.defaultDeviceViewport?.height ?? layout?.defaultHeight ?? 844;
  const mode = layout?.defaultDeviceViewport?.heightMode ?? layout?.defaultHeightMode ?? 'fixed';
  const presetId = resolveViewportPresets(layout).find((p) => p.width === w && p.height === h)?.id ?? 'w390';
  return { w, h, mode, presetId };
}
