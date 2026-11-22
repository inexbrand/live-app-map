/**
 * Срез размеров окон: адаптив карты, override ноды, измеренная высота контента.
 */
import { applyMapDeviceViewport, clampViewport, viewportFromPresetId } from '../../lib/viewport';
import type { AppSlice, ViewportSlice } from './types';

/** Срез размеров окон. */
export const createViewportSlice: AppSlice<ViewportSlice> = (set, get) => ({
  nodeViewports: new Map(),
  contentHeights: new Map(),

  setNodeViewport: (pageId, viewport) => {
    const next = new Map(get().nodeViewports);
    if (viewport === null) {
      next.delete(pageId);
    } else {
      next.set(pageId, clampViewport(viewport));
    }
    set({ nodeViewports: next });
    get().pushLog({
      level: 'info',
      source: pageId,
      message:
        viewport === null
          ? 'Размер окна сброшен к appmap'
          : `Размер окна ${viewport.width}×${viewport.height}${viewport.label ? ` (${viewport.label})` : ''}`,
    });
  },

  getNodeViewport: (pageId) => {
    const override = get().nodeViewports.get(pageId);
    if (override) {
      return override;
    }
    return get().index?.nodesById.get(pageId)?.viewport;
  },

  setContentHeight: (pageId, height) => {
    // Measure только имеет смысл если page/map в auto; store не знает mode
    // per-id — вызывающий (PageNode) уже гейтит heightMode===auto.
    if (!Number.isFinite(height) || height < 120) {
      return;
    }
    const rounded = Math.round(height);
    const prev = get().contentHeights.get(pageId);
    if (prev !== undefined && Math.abs(prev - rounded) <= 4) {
      return;
    }
    const next = new Map(get().contentHeights);
    next.set(pageId, rounded);
    set({ contentHeights: next });
  },

  setMapDeviceViewport: (viewport) => {
    const doc = get().document;
    if (!doc) {
      set({ toast: 'Нет загруженной карты' });
      return;
    }
    const clamped = clampViewport(viewport);
    const layout = applyMapDeviceViewport(doc.layout, clamped);
    set({
      document: { ...doc, layout },
      // fixed map adaptive — сбросить runtime measure/overrides
      nodeViewports: new Map(),
      contentHeights: new Map(),
      toast: `Адаптив карты: ${clamped.width}×${clamped.height}${
        clamped.label ? ` (${clamped.label})` : ''
      } · ${clamped.heightMode ?? 'fixed'}`,
    });
    get().pushLog({
      level: 'info',
      source: 'system',
      message: `map adaptive ${clamped.width}×${clamped.height} mode=${clamped.heightMode ?? 'fixed'}`,
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
