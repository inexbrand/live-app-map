/**
 * Минимальная шапка: бренд, режим, иконки → модалки по краям.
 * Все подписи на русском.
 */
import {
  BookOpen,
  GitCompare,
  Moon,
  Sun,
  Eraser,
  FolderOpen,
  Network,
  Search,
  Database,
  Settings2,
  Layers,
  LayoutGrid,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  fetchDogfoodActors,
  getKorborApiBase,
  isDogfoodClientEnabled,
  type DogfoodActor,
} from '../lib/dogfood-api';
import { SessionProfilesPanel } from './SessionProfilesPanel';
import { useViewStore } from '../store/view-store';
import { useMapSourceStore } from '../store/map-source-store';
import { ensureDogfoodSessions as mintMissingDogfood } from '../lib/ensure-dogfood-sessions';
import { importMapFile } from '../lib/import-map';
import { loadMapPresetIntoStore } from '../lib/load-map-preset';
import type { MapCatalogEntry } from '../lib/map-catalog';
import { resolveViewportPresets } from '../lib/viewport';
import { DEFAULT_MAX_PINNED, useAppStore } from '../store/app-store';
import { Button, Field, Input, Select } from '../ui';
import { EdgeSheet } from './EdgeSheet';
import { Breadcrumbs } from './Breadcrumbs';
import { currentTheme, toggleTheme, type Theme } from '../lib/theme';
import { useUiStore } from '../store/ui-store';

type SheetId = 'sources' | 'settings' | null;

/** Props шапки: каталог из App (fetch /maps/index.json). */
export type MapToolbarProps = {
  readonly catalog: readonly MapCatalogEntry[];
  readonly catalogLoading?: boolean;
};

/**
 * Главный chrome visualizer (минимализм + edge sheets).
 *
 * @param props - каталог карт и состояние загрузки
 */
export function MapToolbar(props: MapToolbarProps) {
  const { catalog, catalogLoading = false } = props;
  const setMode = useAppStore((s) => s.setMode);
  const iframeScale = useAppStore((s) => s.iframeScale);
  const setIframeScale = useAppStore((s) => s.setIframeScale);
  const maxLiveIframes = useAppStore((s) => s.maxLiveIframes);
  const setMaxLiveIframes = useAppStore((s) => s.setMaxLiveIframes);
  const setMapViewportPreset = useAppStore((s) => s.setMapViewportPreset);
  const mapLayout = useAppStore((s) => s.document?.layout);
  const mapDeviceW =
    mapLayout?.defaultDeviceViewport?.width ??
    mapLayout?.defaultWidth ??
    390;
  const mapDeviceH =
    mapLayout?.defaultDeviceViewport?.height ??
    mapLayout?.defaultHeight ??
    844;
  const mapDeviceMode =
    mapLayout?.defaultDeviceViewport?.heightMode ??
    mapLayout?.defaultHeightMode ??
    'fixed';
  // maxWarm / warmCount — keep-alive; fallbacks на случай partial HMR store
  const maxWarmIframes = useAppStore((s) =>
    typeof s.maxWarmIframes === 'number' ? s.maxWarmIframes : 8,
  );
  const setMaxWarmIframes = useAppStore((s) => s.setMaxWarmIframes);
  const baseUrlOverride = useAppStore((s) => s.baseUrlOverride);
  const setBaseUrlOverride = useAppStore((s) => s.setBaseUrlOverride);
  const globalRole = useAppStore((s) => s.globalRole);
  const setGlobalRole = useAppStore((s) => s.setGlobalRole);
  const dogfoodMiniappInitData = useAppStore((s) => s.dogfoodMiniappInitData);
  const setDogfoodMiniappInitData = useAppStore((s) => s.setDogfoodMiniappInitData);
  const dogfoodAdminAccessToken = useAppStore((s) => s.dogfoodAdminAccessToken);
  const setDogfoodAdminAccessToken = useAppStore((s) => s.setDogfoodAdminAccessToken);
  const useTlsProxy = useAppStore((s) => s.useTlsProxy);
  const setUseTlsProxy = useAppStore((s) => s.setUseTlsProxy);
  const loadUnknownJson = useAppStore((s) => s.loadUnknownJson);
  const pushLog = useAppStore((s) => s.pushLog);
  const clearMap = useAppStore((s) => s.clearMap);
  const setToast = useAppStore((s) => s.setToast);
  const setLastLoadError = useAppStore((s) => s.setLastLoadError);
  const document = useAppStore((s) => s.document);
  const liveCount = useAppStore((s) => s.livePageIds.size);
  const warmCount = useAppStore((s) => s.warmPageIds?.size ?? 0);
  const pinCount = useAppStore((s) => s.pinnedPageIds.size);

  const [sheet, setSheet] = useState<SheetId>(null);
  const [loadingPresetId, setLoadingPresetId] = useState<string | null>(null);
  /** Выбранная карта в шапке: id каталога, `__file__` для импортированного файла или пусто. */
  const mapSource = useMapSourceStore((s) => s.source);
  const setMapSource = useMapSourceStore((s) => s.setSource);
  const activeMapId = mapSource === null ? '' : mapSource.kind === 'catalog' ? mapSource.id : '__file__';
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const setPalette = useUiStore((s) => s.setPalette);
  // Тема меняется и клавишей T — кнопка следит за атрибутом корня.
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(currentTheme()));
    mo.observe(window.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  // Карта открыта ссылкой (?map=…): селект показывает её, а не «Выберите карту…».
  useEffect(() => {
    if (activeMapId !== '' || catalog.length === 0) {
      return;
    }
    const mapParam = new URLSearchParams(window.location.search).get('map');
    const hit = mapParam === null ? undefined : catalog.find((c) => c.path === mapParam);
    if (hit !== undefined) {
      setMapSource({ kind: 'catalog', id: hit.id, label: hit.label, path: hit.path });
    }
  }, [catalog, activeMapId, setMapSource]);
  const appView = useViewStore((s) => s.view);
  const setAppView = useViewStore((s) => s.setView);
  const hasDb = useAppStore((s) => (s.document?.code?.tables.length ?? 0) > 0);
  const hasApi = useAppStore((s) => (s.document?.code?.routes.length ?? 0) > 0);
  const hasDocs = useAppStore((s) => s.document?.docs !== undefined);
  const [dogfoodActors, setDogfoodActors] = useState<readonly DogfoodActor[]>(
    [],
  );
  const [dogfoodActorsError, setDogfoodActorsError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (sheet !== 'settings') {
      return;
    }
    if (!isDogfoodClientEnabled(import.meta.env)) {
      setDogfoodActors([]);
      setDogfoodActorsError('Авто-вход отключён в production-сборке');
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await fetchDogfoodActors();
      if (cancelled) {
        return;
      }
      if (!res.ok) {
        setDogfoodActors([]);
        setDogfoodActorsError(res.error);
        return;
      }
      setDogfoodActors(res.data);
      setDogfoodActorsError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [sheet]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSheet(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);


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
    if (loadUnknownJson(result.json)) {
      setMapSource({ kind: 'file', name: file.name });
    }
    if (result.toast !== undefined) {
      setToast(result.toast);
    }
    setSheet(null);
  };

  /**
   * Если нет dogfood-сессии — mint первого admin + первого user с telegramId.
   * Без этого admin всегда login, miniapp «не открывается» (не Telegram).
   */
  const ensureDogfoodSessions = async (): Promise<void> => {
    await mintMissingDogfood({
        dogfoodAdminAccessToken,
        dogfoodMiniappInitData,
        setDogfoodAdminAccessToken,
        setDogfoodMiniappInitData,
        setGlobalRole,
        onActors: (actors) => {
          setDogfoodActors(actors);
          setDogfoodActorsError(null);
        },
        onError: (message) => setDogfoodActorsError(message),
        onToast: setToast,
      });
  };

  const loadPreset = async (preset: MapCatalogEntry) => {
    setLoadingPresetId(preset.id);
    try {
      // iframe dogfood: proxy всегда нужен (frame-bypass + TLS)
      if (!useTlsProxy) {
        setUseTlsProxy(true);
      }
      const res = await loadMapPresetIntoStore(preset, {
        setBaseUrlOverride,
        loadUnknownJson,
        setMode,
      });
      if (!res.ok) {
        setLastLoadError(res.error);
        setToast(res.error);
        return;
      }
      setMapSource({ kind: 'catalog', id: preset.id, label: preset.label, path: preset.path });
      await ensureDogfoodSessions();
      const baseHint =
        preset.baseUrl.trim() !== '' ? ` · ${preset.baseUrl}` : '';
      setToast(`Загружено: ${preset.label}${baseHint}`);
      setSheet(null);
    } finally {
      setLoadingPresetId(null);
    }
  };

  /**
   * Селект в шапке: карты из каталога + действия в конце.
   *
   * @param value - id карты или __open_file__ / __clear__
   */
  const onHeaderMapAction = (value: string): void => {
    if (value === '' || value === activeMapId) {
      return;
    }
    if (value === '__open_file__') {
      window.document.getElementById('lam-file-input')?.click();
      return;
    }
    if (value === '__clear__') {
      clearMap();
      setMapSource(null);
      setToast('Карта очищена');
      return;
    }
    const preset = catalog.find((c) => c.id === value);
    if (preset) {
      void loadPreset(preset);
    }
  };

  return (
    <>
      <header className="toolbar toolbar--slim">
        <label className="toolbar-map-select" title="Выбор карты / действия">
          <span className="sr-only">Карта</span>
          <Select
            aria-label="Карта"
            data-testid="map-select"
            value={activeMapId}
            disabled={catalogLoading || loadingPresetId !== null}
            onChange={(e) => onHeaderMapAction(e.target.value)}
          >
            <option value="">
              {catalogLoading ? 'Каталог…' : 'Выберите карту…'}
            </option>
            {catalog.map((c) => {
              const pagesHint =
                c.pageCount > 0 ? ` · ${c.pageCount} экр.` : '';
              return (
                <option key={c.id} value={c.id}>
                  {c.label}
                  {pagesHint}
                </option>
              );
            })}
            {mapSource?.kind === 'file' ? (
              <option value="__file__" disabled>
                Файл: {mapSource.name}
              </option>
            ) : null}
            <option value="__open_file__">── Открыть JSON / .appmap ──</option>
            <option value="__clear__" disabled={!document}>
              ── Очистить карту ──
            </option>
          </Select>
        </label>

        {document ? (
          <div className="toolbar__group" role="group" aria-label="Вид">
            <Button type="button" size="sm" variant={appView === 'screens' ? 'primary' : 'outline'} aria-pressed={appView === 'screens'} onClick={() => setAppView('screens')} title="Экраны">
              <LayoutGrid size={16} strokeWidth={1.75} />
              <span className="toolbar__label">Экраны</span>
            </Button>
            {hasApi ? (
              <Button type="button" size="sm" variant={appView === 'api' ? 'primary' : 'outline'} aria-pressed={appView === 'api'} onClick={() => setAppView('api')} data-testid="view-api" title="API">
                <Network size={16} strokeWidth={1.75} />
                <span className="toolbar__label">API</span>
              </Button>
            ) : null}
            {hasDb ? (
              <Button type="button" size="sm" variant={appView === 'database' ? 'primary' : 'outline'} aria-pressed={appView === 'database'} onClick={() => setAppView('database')} title="База данных">
                <Database size={16} strokeWidth={1.75} />
                <span className="toolbar__label">База данных</span>
              </Button>
            ) : null}
            {hasDocs ? (
              <Button type="button" size="sm" variant={appView === 'docs' ? 'primary' : 'outline'} aria-pressed={appView === 'docs'} onClick={() => setAppView('docs')} data-testid="view-docs" title="Документация">
                <BookOpen size={16} strokeWidth={1.75} />
                <span className="toolbar__label">Документация</span>
              </Button>
            ) : null}
            <Button type="button" size="sm" variant={appView === 'compare' ? 'primary' : 'outline'} aria-pressed={appView === 'compare'} onClick={() => setAppView('compare')} data-testid="view-compare" title="Сравнение версий карты">
              <GitCompare size={16} strokeWidth={1.75} />
              <span className="toolbar__label">Сравнение</span>
            </Button>
          </div>
        ) : null}

        {document ? <Breadcrumbs /> : null}
        <div className="toolbar__spacer" />

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
            variant="outline"
            size="icon-sm"
            onClick={() => {
              toggleTheme();
            }}
            aria-label={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
            title={theme === 'light' ? 'Тёмная тема (T)' : 'Светлая тема (T)'}
            data-testid="theme-toggle"
          >
            {theme === 'light' ? <Moon size={16} strokeWidth={1.75} /> : <Sun size={16} strokeWidth={1.75} />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPalette(true)}
            aria-label="Поиск по проекту"
            title="Поиск по экранам, роутам, таблицам, эпохам, документам и файлам (⌘K, /)"
            data-testid="open-palette"
          >
            <Search size={16} strokeWidth={1.75} />
            <span className="toolbar__label">Поиск</span>
            <kbd className="palette__kbd">⌘K</kbd>
          </Button>
        </div>
        {/* Вне листа «Источники»: пункт «Открыть…» в селекте работает и при закрытом листе */}
        <input
          id="lam-file-input"
          type="file"
          accept=".json,.appmap,.zip,application/json"
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
        />
      </header>

      <EdgeSheet
        open={sheet === 'sources'}
        side="left"
        title="Источники карты"
        description="Файл, карта из каталога public/maps или очистка холста."
        onClose={() => setSheet(null)}
      >
        <label htmlFor="lam-file-input" className="ui-btn ui-btn--primary source-file-btn">
          <FolderOpen size={16} strokeWidth={1.75} aria-hidden={true} />
          Открыть JSON / .appmap
        </label>

        <div className="sheet-block">
          <div className="ui-field__label">Каталог карт</div>
          <div className="sheet-stack">
            {catalogLoading ? (
              <p className="drawer__hint">Загрузка каталога…</p>
            ) : null}
            {!catalogLoading && catalog.length === 0 ? (
              <p className="drawer__hint">
                Каталог пуст. Положите *.liveappmap.json в public/maps.
              </p>
            ) : null}
            {catalog.map((p) => {
              const busy = loadingPresetId === p.id;
              const pagesHint =
                p.pageCount > 0 ? ` · ${p.pageCount} экр.` : '';
              return (
                <Button
                  key={p.id}
                  type="button"
                  variant="outline"
                  disabled={loadingPresetId !== null}
                  aria-busy={busy}
                  onClick={() => void loadPreset(p)}
                >
                  {busy ? 'Загрузка…' : `${p.label}${pagesHint}`}
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
            setMapSource(null);
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
        description="Масштаб превью, сколько экранов живут одновременно, роль и базовый URL."
        onClose={() => setSheet(null)}
      >
        <p className="drawer__hint" data-testid="iframe-budget">
          Живых экранов {liveCount}
          {maxLiveIframes >= 9999 ? '' : ` из ${maxLiveIframes}`} · на паузе {warmCount}
          {maxWarmIframes >= 9999 ? '' : ` из ${maxWarmIframes}`} · закреплено {pinCount}
        </p>
        <Field label="Масштаб превью" htmlFor="set-scale">
          <Select
            id="set-scale"
            value={iframeScale}
            onChange={(e) =>
              setIframeScale(
                Number(e.target.value) as 0.25 | 0.35 | 0.5 | 0.75 | 1,
              )
            }
          >
            <option value={0.25}>25% (карта)</option>
            <option value={0.35}>35%</option>
            <option value={0.5}>50%</option>
            <option value={0.75}>75%</option>
            <option value={1}>100%</option>
          </Select>
        </Field>

        <Field
          label="Адаптив всех экранов (карта)"
          htmlFor="set-map-adaptive"
          hint={`Сейчас ${mapDeviceW}×${mapDeviceH} · ${mapDeviceMode}. Размер из layout JSON (fixed), не measure при рендере.`}
        >
          <Select
            id="set-map-adaptive"
            data-testid="map-adaptive-select"
            disabled={!document}
            value={(() => {
              const presets = resolveViewportPresets(mapLayout);
              const match = presets.find(
                (p) => p.width === mapDeviceW && p.height === mapDeviceH,
              );
              return match?.id ?? 'w390';
            })()}
            onChange={(e) => {
              setMapViewportPreset(e.target.value);
            }}
          >
            {resolveViewportPresets(mapLayout).map((p) => (
              <option key={p.id} value={p.id}>
                {p.width}×{p.height}
                {p.id === 'w390' ? ' phone (default)' : ''}
                {p.id === 'w360' ? ' phone S' : ''}
                {p.id === 'w768' ? ' tablet' : ''}
                {p.id === 'w1280' ? ' laptop' : ''}
                {p.id === 'w1920' ? ' desktop' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Макс. живых iframe"
          htmlFor="set-max"
          hint="Multi-iframe с бюджетом: pin + выбранный + видимые (по приоритету). Остальные — placeholder. «Без лимита» только для маленьких карт."
        >
          <Select
            id="set-max"
            value={maxLiveIframes >= 9999 ? 9999 : maxLiveIframes}
            onChange={(e) => setMaxLiveIframes(Number(e.target.value))}
          >
            {[4, 6, 8, 12, 16].map((n) => (
              <option key={n} value={n}>
                {n}
                {n === 8 ? ' (по умолчанию)' : ''}
              </option>
            ))}
            <option value={9999}>Без лимита (осторожно)</option>
          </Select>
        </Field>

        <Field
          label="Warm keep-alive"
          htmlFor="set-warm"
          hint="Сколько iframe держать в DOM после ухода из live (без перезагрузки SPA). Pin не вытесняются первыми."
        >
          <Select
            id="set-warm"
            value={maxWarmIframes >= 9999 ? 9999 : maxWarmIframes}
            onChange={(e) => setMaxWarmIframes(Number(e.target.value))}
          >
            {[0, 4, 6, 8, 12, 16].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? '0 (сразу unmount)' : n}
                {n === 8 ? ' (по умолчанию)' : ''}
              </option>
            ))}
            <option value={9999}>Без лимита warm</option>
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

        <div className="sheet-block">
          <div className="ui-field__label">Iframe proxy (dogfood)</div>
          <p className="drawer__hint">
            Same-origin proxy: miniapp (TLS self-signed), admin :16002 и site
            :16001 (снимает X-Frame-Options / CSP). Без proxy iframe часто
            пустой или «отказ во фрейме».
          </p>
          <label className="ui-chip" style={{ cursor: 'pointer', width: 'fit-content' }}>
            <input
              type="checkbox"
              checked={useTlsProxy}
              onChange={(e) => setUseTlsProxy(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            Proxy iframe (miniapp + admin + site)
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void (async () => {
                const target =
                  baseUrlOverride.trim() || 'https://vite.localhost:5175/';
                try {
                  const r = await fetch(
                    `/__lam_tls_check?url=${encodeURIComponent(target)}`,
                  );
                  const j = (await r.json()) as {
                    ok?: boolean;
                    message?: string;
                    error?: string;
                    status?: number;
                  };
                  const msg = j.ok
                    ? `TLS OK · HTTP ${j.status ?? '—'} · ${j.message ?? ''}`
                    : `TLS fail · ${j.error ?? 'unknown'}`;
                  setToast(msg);
                  pushLog({
                    level: j.ok ? 'info' : 'warn',
                    source: 'system',
                    message: msg,
                  });
                } catch (err) {
                  const m = err instanceof Error ? err.message : String(err);
                  setToast(`TLS check: ${m}`);
                }
              })();
            }}
          >
            Проверить TLS origin
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              window.open(
                baseUrlOverride.trim() || 'https://vite.localhost:5175/',
                '_blank',
                'noopener,noreferrer',
              );
              setToast(
                'Откройте origin и примите сертификат в браузере (если proxy выкл)',
              );
            }}
          >
            Открыть origin (доверие cert)
          </Button>
        </div>

        <SessionProfilesPanel actors={dogfoodActors} actorsError={dogfoodActorsError} apiBase={getKorborApiBase()} />
      </EdgeSheet>

    </>
  );
}
