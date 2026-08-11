/**
 * Shell Live App Map Visualizer (UI kit + feedback).
 */
import { AlertTriangle, X } from 'lucide-react';
import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { DiagnosticsDock } from './components/DiagnosticsDock';
import { FeedbackPanel } from './components/FeedbackPanel';
import { LamGrabHost } from './components/LamGrabHost';
import { MapToolbar } from './components/MapToolbar';
import { SnapshotOverlay } from './components/SnapshotOverlay';
import { StateInjectPanel } from './components/StateInjectPanel';
import { AppMapCanvas } from './flow/AppMapCanvas';
import { ensureDogfoodSessions } from './lib/ensure-dogfood-sessions';
import { importMapFile } from './lib/import-map';
import { loadMapPresetIntoStore } from './lib/load-map-preset';
import {
  fetchMapCatalog,
  type MapCatalogEntry,
} from './lib/map-catalog';
import { useAppStore } from './store/app-store';
import { Button } from './ui';

/**
 * Корневой shell.
 */
export function App() {
  const mapDocument = useAppStore((s) => s.document);
  const toast = useAppStore((s) => s.toast);
  const setToast = useAppStore((s) => s.setToast);
  const lastLoadError = useAppStore((s) => s.lastLoadError);
  const clearLoadError = useAppStore((s) => s.clearLoadError);
  const setLastLoadError = useAppStore((s) => s.setLastLoadError);
  const loadUnknownJson = useAppStore((s) => s.loadUnknownJson);
  const setBaseUrlOverride = useAppStore((s) => s.setBaseUrlOverride);
  const setMode = useAppStore((s) => s.setMode);
  const parseIssues = useAppStore((s) => s.parseIssues);
  const [dragging, setDragging] = useState(false);
  const [loadingPresetId, setLoadingPresetId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<readonly MapCatalogEntry[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    void fetchMapCatalog().then((res) => {
      if (cancelled) {
        return;
      }
      setCatalogLoading(false);
      if (!res.ok) {
        setCatalogError(res.error);
        setCatalog([]);
        return;
      }
      setCatalogError(null);
      setCatalog(res.catalog.maps);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const runDogfoodAfterMapLoad = useCallback(async () => {
    const s = useAppStore.getState();
    await ensureDogfoodSessions({
      dogfoodAdminAccessToken: s.dogfoodAdminAccessToken,
      dogfoodMiniappInitData: s.dogfoodMiniappInitData,
      setDogfoodAdminAccessToken: s.setDogfoodAdminAccessToken,
      setDogfoodMiniappInitData: s.setDogfoodMiniappInitData,
      setGlobalRole: s.setGlobalRole,
      onToast: setToast,
    });
  }, [setToast]);

  const loadPreset = useCallback(
    async (preset: MapCatalogEntry) => {
      setLoadingPresetId(preset.id);
      try {
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
        await runDogfoodAfterMapLoad();
        const baseHint =
          preset.baseUrl.trim() !== '' ? ` · ${preset.baseUrl}` : '';
        setToast(`${preset.label}${baseHint}`);
      } finally {
        setLoadingPresetId(null);
      }
    },
    [
      loadUnknownJson,
      runDogfoodAfterMapLoad,
      setBaseUrlOverride,
      setLastLoadError,
      setMode,
      setToast,
    ],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const baseUrl = params.get('baseUrl');
    const map = params.get('map');
    const role = params.get('role');
    if (baseUrl) {
      setBaseUrlOverride(baseUrl);
    }
    if (role) {
      useAppStore.getState().setGlobalRole(role);
    }
    if (map) {
      void fetch(map)
        .then(async (r) => {
          if (!r.ok) {
            const msg = `Не удалось загрузить карту ${map}: HTTP ${r.status}`;
            setLastLoadError(msg);
            setToast(msg);
            return;
          }
          const json = (await r.json()) as unknown;
          loadUnknownJson(json);
          setMode('live');
          // Deep-link / refresh: auto dogfood (раньше только через select карты)
          await runDogfoodAfterMapLoad();
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          setLastLoadError(msg);
          setToast(msg);
        });
    }
  }, [
    loadUnknownJson,
    runDogfoodAfterMapLoad,
    setBaseUrlOverride,
    setLastLoadError,
    setMode,
    setToast,
  ]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast, setToast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearLoadError();
        setToast(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearLoadError, setToast]);

  const onDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
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
    },
    [loadUnknownJson, setLastLoadError, setToast],
  );

  return (
    <div
      className={`app-shell${dragging ? ' app-shell--drag' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => void onDrop(e)}
    >
      <MapToolbar catalog={catalog} catalogLoading={catalogLoading} />
      <LamGrabHost />
      <div className="app-main">
        {lastLoadError ? (
          <div className="error-banner" role="alert">
            <div className="error-banner__body">
              <strong>
                <AlertTriangle
                  size={16}
                  style={{ verticalAlign: 'text-bottom', marginRight: 6 }}
                />
                Ошибка загрузки
              </strong>
              <span>{lastLoadError}</span>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => clearLoadError()}>
              <X size={16} />
            </Button>
          </div>
        ) : null}

        {mapDocument && parseIssues.length > 0 ? (
          <div className="warnings-banner" role="status">
            <strong>Предупреждения parse ({parseIssues.length})</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {parseIssues.slice(0, 6).map((d, i) => (
                <li key={`${d.code}-${i}`}>
                  {d.message}
                  {d.path ? ` · ${d.path}` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!mapDocument ? (
          <div className="empty-state">
            <div className="empty-state__card">
              <h1>Выберите карту</h1>
              <p>
                Карта из каталога (файлы в <code>public/maps</code>), JSON /
                .appmap или drag-and-drop на холст. В шапке — селект карт,
                «Источники», «Настройки», поиск.
              </p>
              <p>
                Выберите экран → слева замечание для агента, справа роли и
                стейты (если есть в карте).
              </p>
              {catalogError ? (
                <p className="drawer__hint" role="status">
                  {catalogError}
                </p>
              ) : null}
              <div className="empty-state__actions">
                {catalogLoading ? (
                  <Button type="button" variant="outline" disabled={true}>
                    Загрузка каталога…
                  </Button>
                ) : null}
                {!catalogLoading && catalog.length === 0 ? (
                  <p className="drawer__hint">
                    Каталог пуст. Положите{' '}
                    <code>*.liveappmap.json</code> в{' '}
                    <code>apps/visualizer-spa/public/maps/</code> и обновите
                    страницу.
                  </p>
                ) : null}
                {catalog.map((p) => {
                  const busy = loadingPresetId === p.id;
                  return (
                    <Button
                      key={p.id}
                      type="button"
                      variant="primary"
                      disabled={loadingPresetId !== null}
                      aria-busy={busy}
                      title={
                        p.pageCount > 0
                          ? `${p.path} · ${p.pageCount} экранов`
                          : p.path
                      }
                      onClick={() => void loadPreset(p)}
                    >
                      {busy ? 'Загрузка…' : p.label}
                    </Button>
                  );
                })}
              </div>
              <p className="drawer__hint">
                Запуск: <code>bun run dev</code> → http://localhost:4310 ·
                каталог: <code>/maps/index.json</code>
              </p>
            </div>
          </div>
        ) : (
          <div className="canvas-wrap">
            <AppMapCanvas />
            <FeedbackPanel />
            <StateInjectPanel />
            <SnapshotOverlay />
          </div>
        )}
        <DiagnosticsDock />
      </div>
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
