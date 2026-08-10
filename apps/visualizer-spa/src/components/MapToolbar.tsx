/**
 * Тулбар: загрузка, mode, scale, роль, baseUrl, пресеты Korbor, бюджет iframe.
 */
import { useState } from 'react';
import {
  fetchKorborPreset,
  KORBOR_PRESETS,
  type KorborPreset,
} from '../korbor-presets';
import { DEFAULT_MAX_PINNED, useAppStore } from '../store/app-store';

export function MapToolbar() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const iframeScale = useAppStore((s) => s.iframeScale);
  const setIframeScale = useAppStore((s) => s.setIframeScale);
  const maxLiveIframes = useAppStore((s) => s.maxLiveIframes);
  const setMaxLiveIframes = useAppStore((s) => s.setMaxLiveIframes);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const baseUrlOverride = useAppStore((s) => s.baseUrlOverride);
  const setBaseUrlOverride = useAppStore((s) => s.setBaseUrlOverride);
  const globalRole = useAppStore((s) => s.globalRole);
  const setGlobalRole = useAppStore((s) => s.setGlobalRole);
  const loadUnknownJson = useAppStore((s) => s.loadUnknownJson);
  const clearMap = useAppStore((s) => s.clearMap);
  const setToast = useAppStore((s) => s.setToast);
  const setLastLoadError = useAppStore((s) => s.setLastLoadError);
  const document = useAppStore((s) => s.document);
  const liveCount = useAppStore((s) => s.livePageIds.size);
  const pinCount = useAppStore((s) => s.pinnedPageIds.size);

  const [loadingPresetId, setLoadingPresetId] = useState<string | null>(null);

  const onFile = async (file: File | null) => {
    if (!file) {
      return;
    }
    if (file.name.endsWith('.appmap') || file.name.endsWith('.zip')) {
      const { parseAppMapZip } = await import('@live-app-map/export-appmap');
      const buf = await file.arrayBuffer();
      const result = await parseAppMapZip(buf);
      if (!result.ok) {
        const msg = result.errors.join('; ');
        setLastLoadError(msg);
        setToast(msg);
        return;
      }
      loadUnknownJson(result.document);
      setToast(`Импорт .appmap: ${result.document.pages.length} pages`);
      return;
    }
    const text = await file.text();
    try {
      loadUnknownJson(JSON.parse(text) as unknown);
    } catch {
      const msg = 'Файл не JSON';
      setLastLoadError(msg);
      setToast(msg);
    }
  };

  const loadPreset = async (preset: KorborPreset) => {
    setLoadingPresetId(preset.id);
    try {
      const res = await fetchKorborPreset(preset);
      if (!res.ok) {
        setLastLoadError(res.error);
        setToast(res.error);
        return;
      }
      setBaseUrlOverride(preset.baseUrl);
      loadUnknownJson(res.json);
      setMode('live');
      setToast(`${preset.label} · baseUrl ${preset.baseUrl}`);
    } finally {
      setLoadingPresetId(null);
    }
  };

  return (
    <header className="toolbar">
      <div className="toolbar__brand">Live App Map</div>

      <label className="btn">
        Открыть…
        <input
          type="file"
          accept=".json,.appmap,.zip,application/json"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
      </label>

      <button type="button" className="btn" onClick={() => clearMap()} disabled={!document}>
        Очистить
      </button>

      <div className="toolbar__group">
        {KORBOR_PRESETS.map((p) => {
          const busy = loadingPresetId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className="btn btn--primary"
              disabled={loadingPresetId !== null}
              aria-busy={busy}
              onClick={() => void loadPreset(p)}
            >
              {busy ? `Загрузка…` : p.label}
            </button>
          );
        })}
      </div>

      <div className="toolbar__group">
        <button
          type="button"
          className={`btn${mode === 'map-only' ? ' btn--active' : ''}`}
          onClick={() => setMode('map-only')}
        >
          Map
        </button>
        <button
          type="button"
          className={`btn${mode === 'live' ? ' btn--active' : ''}`}
          onClick={() => setMode('live')}
        >
          Live
        </button>
        <button
          type="button"
          className={`btn${mode === 'compact' ? ' btn--active' : ''}`}
          onClick={() => setMode('compact')}
        >
          Compact
        </button>
      </div>

      <label className="field">
        Scale
        <select
          value={iframeScale}
          onChange={(e) => setIframeScale(Number(e.target.value) as 0.5 | 0.75 | 1)}
        >
          <option value={0.5}>50%</option>
          <option value={0.75}>75%</option>
          <option value={1}>100%</option>
        </select>
      </label>

      <label className="field" title="Максимум одновременных live iframe (1–16)">
        Max live
        <select
          value={maxLiveIframes}
          onChange={(e) => setMaxLiveIframes(Number(e.target.value))}
        >
          {[1, 2, 4, 6, 8, 12, 16].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <label className="field" title="Инжект роли в iframe URL (?lam_role=)">
        Роль
        <select value={globalRole} onChange={(e) => setGlobalRole(e.target.value)}>
          <option value="">— нет —</option>
          <option value="recruiter">Рекрутер</option>
          <option value="employer">Клиент (employer)</option>
        </select>
      </label>

      <label className="field">
        Base URL
        <input
          value={baseUrlOverride}
          placeholder="http://localhost:…"
          onChange={(e) => setBaseUrlOverride(e.target.value)}
          onBlur={(e) => setBaseUrlOverride(e.target.value)}
          style={{ minWidth: 200 }}
        />
      </label>

      <label className="field">
        Поиск
        <input
          value={searchQuery}
          placeholder="title / path"
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </label>

      <span className="budget-pill" title="Бюджет live iframe и pin">
        live {liveCount}/{maxLiveIframes} · pin {pinCount}/{DEFAULT_MAX_PINNED}
      </span>
    </header>
  );
}
