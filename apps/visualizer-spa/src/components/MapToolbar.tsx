/**
 * Минимальная шапка: бренд, режим, иконки → модалки по краям.
 * Все подписи на русском.
 */
import {
  Eraser,
  FolderOpen,
  LayoutGrid,
  Map as MapIcon,
  Radio,
  Search,
  Settings2,
  Layers,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  fetchKorborPreset,
  KORBOR_PRESETS,
  type KorborPreset,
} from '../korbor-presets';
import { importMapFile } from '../lib/import-map';
import { DEFAULT_MAX_PINNED, useAppStore } from '../store/app-store';
import { Button, Field, Input, Select } from '../ui';
import { EdgeSheet } from './EdgeSheet';

type SheetId = 'sources' | 'settings' | 'search' | null;

/**
 * Главный chrome visualizer (минимализм + edge sheets).
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

  const [sheet, setSheet] = useState<SheetId>(null);
  const [loadingPresetId, setLoadingPresetId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSheet(null);
        return;
      }
      if (
        e.key === '/' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setSheet('search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (sheet !== 'search') {
      return;
    }
    const t = window.setTimeout(() => {
      window.document
        .querySelector<HTMLInputElement>('input[data-lam-search]')
        ?.focus();
    }, 40);
    return () => window.clearTimeout(t);
  }, [sheet]);

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
    setSheet(null);
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
      setToast(`Загружено: ${preset.label}`);
      setSheet(null);
    } finally {
      setLoadingPresetId(null);
    }
  };

  const modeLabel =
    mode === 'live' ? 'Живой' : mode === 'compact' ? 'Компакт' : 'Карта';

  return (
    <>
      <header className="toolbar toolbar--slim">
        <div className="toolbar__brand" title="Live App Map">
          <LayoutGrid size={18} strokeWidth={1.75} aria-hidden={true} />
          <span>Карта приложения</span>
        </div>

        <div className="mode-seg" role="group" aria-label="Режим просмотра">
          <button
            type="button"
            className={`mode-seg__btn${mode === 'map-only' ? ' mode-seg__btn--on' : ''}`}
            onClick={() => setMode('map-only')}
            title="Только схема"
          >
            <MapIcon size={15} strokeWidth={1.75} />
            Карта
          </button>
          <button
            type="button"
            className={`mode-seg__btn${mode === 'live' ? ' mode-seg__btn--on' : ''}`}
            onClick={() => setMode('live')}
            title="Живые iframe"
          >
            <Radio size={15} strokeWidth={1.75} />
            Живой
          </button>
          <button
            type="button"
            className={`mode-seg__btn${mode === 'compact' ? ' mode-seg__btn--on' : ''}`}
            onClick={() => setMode('compact')}
            title="Плотные узлы"
          >
            Компакт
          </button>
        </div>

        <div className="toolbar__spacer" />

        <span className="budget-pill" title="Бюджет iframe и закреплений">
          {modeLabel} · живых {liveCount}/{maxLiveIframes} · pin {pinCount}/
          {DEFAULT_MAX_PINNED}
        </span>

        <div className="toolbar__group">
          <Button
            type="button"
            variant={sheet === 'sources' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setSheet(sheet === 'sources' ? null : 'sources')}
            aria-expanded={sheet === 'sources'}
          >
            <Layers size={16} strokeWidth={1.75} />
            Источники
          </Button>
          <Button
            type="button"
            variant={sheet === 'settings' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setSheet(sheet === 'settings' ? null : 'settings')}
            aria-expanded={sheet === 'settings'}
          >
            <Settings2 size={16} strokeWidth={1.75} />
            Настройки
          </Button>
          <Button
            type="button"
            variant={sheet === 'search' ? 'primary' : 'outline'}
            size="icon-sm"
            onClick={() => setSheet(sheet === 'search' ? null : 'search')}
            aria-label="Поиск экранов"
            title="Поиск (/ )"
          >
            <Search size={16} strokeWidth={1.75} />
          </Button>
        </div>
      </header>

      <EdgeSheet
        open={sheet === 'sources'}
        side="left"
        title="Источники карты"
        description="Файл, пресеты Korbor или очистка холста."
        onClose={() => setSheet(null)}
      >
        <label className="ui-btn ui-btn--primary source-file-btn">
          <FolderOpen size={16} strokeWidth={1.75} aria-hidden={true} />
          Открыть JSON / .appmap
          <input
            type="file"
            accept=".json,.appmap,.zip,application/json"
            hidden
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <div className="sheet-block">
          <div className="ui-field__label">Пресеты Korbor</div>
          <div className="sheet-stack">
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
        </div>

        <Button
          type="button"
          variant="ghost"
          disabled={!document}
          onClick={() => {
            clearMap();
            setSheet(null);
            setToast('Карта очищена');
          }}
        >
          <Eraser size={16} strokeWidth={1.75} />
          Очистить карту
        </Button>
      </EdgeSheet>

      <EdgeSheet
        open={sheet === 'settings'}
        side="right"
        title="Настройки просмотра"
        description="Масштаб iframe, бюджет, роль и базовый URL."
        onClose={() => setSheet(null)}
      >
        <Field label="Масштаб превью" htmlFor="set-scale">
          <Select
            id="set-scale"
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

        <Field
          label="Макс. живых iframe"
          htmlFor="set-max"
          hint="Сколько экранов одновременно держать «живыми»."
        >
          <Select
            id="set-max"
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

        <Field
          label="Роль (miniapp)"
          htmlFor="set-role"
          hint="Добавляет ?lam_role=… к live URL."
        >
          <Select
            id="set-role"
            value={globalRole}
            onChange={(e) => setGlobalRole(e.target.value)}
          >
            <option value="">Без роли</option>
            <option value="recruiter">Рекрутер</option>
            <option value="employer">Клиент (работодатель)</option>
          </Select>
        </Field>

        <Field
          label="Базовый URL"
          htmlFor="set-base"
          hint="Куда смотрят live-iframe (dev-сервер приложения)."
        >
          <Input
            id="set-base"
            value={baseUrlOverride}
            placeholder="https://vite.localhost:5175"
            onChange={(e) => setBaseUrlOverride(e.target.value)}
            onBlur={(e) => setBaseUrlOverride(e.target.value)}
          />
        </Field>
      </EdgeSheet>

      <EdgeSheet
        open={sheet === 'search'}
        side="top"
        title="Поиск экранов"
        description="По названию, пути или id. Клавиша / ."
        onClose={() => setSheet(null)}
      >
        <Field label="Запрос" htmlFor="set-search">
          <Input
            id="set-search"
            data-lam-search
            value={searchQuery}
            placeholder="например: feed, вакансии, /employer"
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </Field>
        {searchQuery.trim() ? (
          <p className="drawer__hint">
            Фильтр активен на холсте. Очистите поле, чтобы снова видеть все
            экраны.
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setSearchQuery('');
            setSheet(null);
          }}
        >
          Сбросить поиск
        </Button>
      </EdgeSheet>
    </>
  );
}
