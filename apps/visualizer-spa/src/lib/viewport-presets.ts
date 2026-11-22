/**
 * Пресеты адаптива карты: встроенные с поверх наложенными из layout JSON, окно по id.
 */
import type { DeviceViewport, LayoutHints } from '@live-app-map/schema';
import { BUILTIN_VIEWPORT_PRESETS, clampViewport, DEFAULT_HEIGHT_FALLBACK, type ViewportPreset } from './viewport';

/**
 * Пресеты: builtin + overlay из layout JSON (по id).
 * Неполный JSON (без w1024) **не** прячет builtin — UI adaptive всегда полный.
 */
export function resolveViewportPresets(
  layout: LayoutHints | undefined,
): readonly ViewportPreset[] {
  const fromJson = layout?.viewportPresets;
  if (fromJson === undefined || fromJson.length === 0) {
    return BUILTIN_VIEWPORT_PRESETS;
  }

  const byId = new Map<string, ViewportPreset>();
  for (const p of BUILTIN_VIEWPORT_PRESETS) {
    byId.set(p.id, p);
  }
  for (const p of fromJson) {
    byId.set(p.id, {
      id: p.id,
      label: p.label,
      width: p.width,
      height: p.height ?? DEFAULT_HEIGHT_FALLBACK,
      heightMode: p.heightMode ?? 'fixed',
    });
  }

  const order: string[] = BUILTIN_VIEWPORT_PRESETS.map((p) => p.id);
  for (const p of fromJson) {
    if (!order.includes(p.id)) {
      order.push(p.id);
    }
  }

  const out: ViewportPreset[] = [];
  for (const id of order) {
    const preset = byId.get(id);
    if (preset !== undefined) {
      out.push(preset);
    }
  }
  return out;
}

/**
 * Собрать DeviceViewport из id builtin/layout preset.
 */
export function viewportFromPresetId(
  presetId: string,
  layout: LayoutHints | undefined,
): DeviceViewport | null {
  const presets = resolveViewportPresets(layout);
  const p = presets.find((x) => x.id === presetId);
  if (p === undefined) {
    return null;
  }
  return clampViewport({
    width: p.width,
    height: p.height,
    label: p.label,
    heightMode: p.heightMode ?? 'fixed',
  });
}
