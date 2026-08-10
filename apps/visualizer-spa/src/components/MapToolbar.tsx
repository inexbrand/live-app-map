/**
 * Тулбар на UI-kit (monochrome + Lucide).
 */
import {
  Eraser,
  FolderOpen,
  LayoutGrid,
  Map as MapIcon,
  Radio,
} from 'lucide-react';
import { useState } from 'react';
import {
  fetchKorborPreset,
  KORBOR_PRESETS,
  type KorborPreset,
} from '../korbor-presets';
import { importMapFile } from '../lib/import-map';
import { DEFAULT_MAX_PINNED, useAppStore } from '../store/app-store';
import { Button, Field, Input, Select } from '../ui';

/**
 * Главный тулбар visualizer.
 */
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
    const result = await importMapFile(file);
    if (!result.ok) {
      setLastLoadError(result.error);
      setToast(result.error);
      return;
    }
    loadUnknownJson(result.json);
    if (result.toast !== undefined) {
      setToast(result.toast);
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
      setToast(`${preset.label} · ${preset.baseUrl}`);
    } finally {
      setLoadingPresetId(null);
    }
  };

  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <LayoutGrid size={18} strokeWidth={1.75} aria-hidden={true} />
        Live App Map
      </div>

      <label className="ui-btn ui-btn--primary" title="Открыть JSON / .appmap">
        <FolderOpen size={16} strokeWidth={1.75} aria-hidden={true} />
        Открыть
        <input
          type="file"
          accept=".json,.appmap,.zip,application/json"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
      </label>

      <Button
        type="button"
        variant="outline"
        disabled={!document}
        onClick={() => clearMap()}
        title="Очистить карту"
      >
        <Eraser size={16} strokeWidth={1.75} />
        Очистить
      </Button>

      <div className="toolbar__group" role="group" aria-label="Пресеты Korbor">
        {KORBOR_PRESETS.map((p) => {
          const busy = loadingPresetId === p.id;
          return (
            <Button
              key={p.id}
              type="button"
              variant="outline"
              disabled={loadingPresetId !== null}
              aria-busy={busy}
              onClick={() => void loadPreset(p)}
            >
              {busy ? 'Загрузка…' : p.label}
            </Button>
          );
        })}
      </div>

      <div className="toolbar__group" role="group" aria-label="Режим карты">
        <Button
          type="button"
          variant="ghost"
          active={mode === 'map-only'}
          onClick={() => setMode('map-only')}
        >
          <MapIcon size={16} strokeWidth={1.75} />
          Map
        </Button>
        <Button
          type="button"
          variant="ghost"
          active={mode === 'live'}
          onClick={() => setMode('live')}
        >
          <Radio size={16} strokeWidth={1.75} />
          Live
        </Button>
        <Button
          type="button"
          variant="ghost"
          active={mode === 'compact'}
          onClick={() => setMode('compact')}
        >
          Compact
        </Button>
      </div>

      <Field label="Scale" htmlFor="tb-scale" inline>
        <Select
          id="tb-scale"
          value={iframeScale}
          onChange={(e) =>
            setIframeScale(Number(e.target.value) as 0.5 | 0.75 | 1)
          }
        >
          <option value={0.5}>50%</option>
          <option value={0.75}>75%</option>
          <option value={1}>100%</option>
        </Select>
      </Field>

      <Field label="Max live" htmlFor="tb-max" inline>
        <Select
          id="tb-max"
          value={maxLiveIframes}
          onChange={(e) => setMaxLiveIframes(Number(e.target.value))}
        >
          {[1, 2, 4, 6, 8, 12, 16].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Роль" htmlFor="tb-role" inline>
        <Select
          id="tb-role"
          value={globalRole}
          onChange={(e) => setGlobalRole(e.target.value)}
        >
          <option value="">—</option>
          <option value="recruiter">Рекрутер</option>
          <option value="employer">Клиент</option>
        </Select>
      </Field>

      <Field label="Base URL" htmlFor="tb-base" inline>
        <Input
          id="tb-base"
          value={baseUrlOverride}
          placeholder="https://vite.localhost:5175"
          onChange={(e) => setBaseUrlOverride(e.target.value)}
          onBlur={(e) => setBaseUrlOverride(e.target.value)}
          style={{ minWidth: 200 }}
        />
      </Field>

      <Field label="Поиск" htmlFor="tb-search" inline>
        <Input
          id="tb-search"
          data-lam-search
          value={searchQuery}
          placeholder="title / path"
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </Field>

      <span className="budget-pill" title="Бюджет live iframe и pin">
        live {liveCount}/{maxLiveIframes} · pin {pinCount}/{DEFAULT_MAX_PINNED}
      </span>
    </header>
  );
}
