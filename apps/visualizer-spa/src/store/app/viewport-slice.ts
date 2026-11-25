/**
 * Срез размеров окон: адаптив карты, override ноды, измеренная высота контента.
 */
import { applyMapDeviceViewport, clampViewport } from '../../lib/viewport';
import { viewportFromPresetId } from '../../lib/viewport-presets';
import { indexFor } from './map-slice';
import type { AppSlice, ViewportSlice } from './types';

type Viewport = ReturnType<typeof clampViewport>;

/** Override ноды: null — сброс к размеру из карты. */
function withOverride(map: ReadonlyMap<string, Viewport>, pageId: string, viewport: Viewport | null): Map<string, Viewport> {
  const next = new Map(map);
  if (viewport === null) {
    next.delete(pageId);
  } else {
    next.set(pageId, clampViewport(viewport));
  }
  return next;
}

function modeOf(v: Viewport): string {
  return v.heightMode ?? 'fixed';
}

/** Размер ноды из карты. */
function mapViewportOf(index: { readonly nodesById: ReadonlyMap<string, { readonly viewport?: Viewport }> } | null, pageId: string): Viewport | undefined {
  return index?.nodesById.get(pageId)?.viewport;
}

function labelSuffix(v: { readonly label?: string }): string {
  return v.label ? ` (${v.label})` : '';
}

/** Измерение годится (не меньше 120 px) и отличается от прежнего больше чем на 4 px. */
function isNewHeight(prev: number | undefined, height: number): boolean {
  if (!Number.isFinite(height) || height < 120) {
    return false;
  }
  return prev === undefined || Math.abs(prev - Math.round(height)) > 4;
}

/** Срез размеров окон. */
export const createViewportSlice: AppSlice<ViewportSlice> = (set, get) => ({
  nodeViewports: new Map(),
  contentHeights: new Map(),

  setNodeViewport: (pageId, viewport) => {
    set({ nodeViewports: withOverride(get().nodeViewports, pageId, viewport) });
    get().pushLog({
      level: 'info',
      source: pageId,
      message: viewport === null ? 'Размер окна сброшен к appmap' : `Размер окна ${viewport.width}×${viewport.height}${labelSuffix(viewport)}`,
    });
  },

  getNodeViewport: (pageId) => get().nodeViewports.get(pageId) ?? mapViewportOf(get().index, pageId),

  setContentHeight: (pageId, height) => {
    // Measure только имеет смысл если page/map в auto; store не знает mode
    // per-id — вызывающий (PageNode) уже гейтит heightMode===auto.
    const rounded = Math.round(height);
    if (isNewHeight(get().contentHeights.get(pageId), height)) {
      set({ contentHeights: new Map(get().contentHeights).set(pageId, rounded) });
    }
  },

  setMapDeviceViewport: (viewport) => {
    const doc = get().document;
    if (!doc) {
      set({ toast: 'Нет загруженной карты' });
      return;
    }
    const clamped = clampViewport(viewport);
    const layout = applyMapDeviceViewport(doc.layout, clamped);
    // «Размер всех экранов» — для всех: размер экрана из карты (скан пишет размер приложения) снимается
    const nodes = doc.nodes.map(({ viewport: _own, ...n }) => n);
    const next = { ...doc, layout, nodes };
    set({
      document: next,
      index: indexFor(next, get().projectStates, get().showStates),
      // fixed map adaptive — сбросить runtime measure/overrides
      nodeViewports: new Map(),
      contentHeights: new Map(),
      toast: `Адаптив карты: ${clamped.width}×${clamped.height}${labelSuffix(clamped)} · ${modeOf(clamped)}`,
    });
    get().pushLog({
      level: 'info',
      source: 'system',
      message: `map adaptive ${clamped.width}×${clamped.height} mode=${modeOf(clamped)}`,
    });
  },

  setMapViewportPreset: (presetId) => {
    const doc = get().document;
    if (!doc) {
      set({ toast: 'Нет загруженной карты' });
      return;
    }
    const vp = viewportFromPresetId(presetId, doc.layout);
    if (vp === null) {
      set({ toast: `Пресет «${presetId}» не найден` });
      return;
    }
    get().setMapDeviceViewport(vp);
  },
});