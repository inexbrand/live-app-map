/**
 * Shell Live App Map Visualizer.
 */
import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { MapToolbar } from './components/MapToolbar';
import { StateInjectPanel } from './components/StateInjectPanel';
import { AppMapCanvas } from './flow/AppMapCanvas';
import {
  fetchKorborPreset,
  KORBOR_PRESETS,
  type KorborPreset,
} from './korbor-presets';
import {
  DEFAULT_MAX_PINNED,
  useAppStore,
} from './store/app-store';

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
  const liveCount = useAppStore((s) => s.livePageIds.size);
  const maxLiveIframes = useAppStore((s) => s.maxLiveIframes);
  const pinCount = useAppStore((s) => s.pinnedPageIds.size);
  const mode = useAppStore((s) => s.mode);
  const parseIssues = useAppStore((s) => s.parseIssues);
  const globalRole = useAppStore((s) => s.globalRole);
  const [dragging, setDragging] = useState(false);
  const [loadingPresetId, setLoadingPresetId] = useState<string | null>(null);

  const loadPreset = useCallback(
    async (preset: KorborPreset) => {
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
    },
    [loadUnknownJson, setBaseUrlOverride, setLastLoadError, setMode, setToast],
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
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          setLastLoadError(msg);
          setToast(msg);
        });
    }
  }, [loadUnknownJson, setBaseUrlOverride, setLastLoadError, setMode, setToast]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast, setToast]);

  // Клавиатура: / — фокус поиска, Esc — снять selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        useAppStore.getState().selectPage(null);
        return;
      }
      if (
        e.key === '/' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        const input = window.document.querySelector<HTMLInputElement>(
          'input[data-lam-search]',
        );
        input?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (!file) {
        return;
      }
      if (file.name.endsWith('.appmap') || file.name.endsWith('.zip')) {
        const { parseAppMapZip } = await import('@live-app-map/export-appmap');
        const result = await parseAppMapZip(await file.arrayBuffer());
        if (!result.ok) {
          const msg = result.errors.join('; ');
          setLastLoadError(msg);
          setToast(msg);
          return;
        }
        loadUnknownJson(result.document);
        return;
      }
      try {
        loadUnknownJson(JSON.parse(await file.text()) as unknown);
      } catch {
        const msg = 'Не удалось прочитать файл';
        setLastLoadError(msg);
        setToast(msg);
      }
    },
    [loadUnknownJson, setLastLoadError, setToast],
  );

  return (
    <div
      className="app-shell"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => void onDrop(e)}
    >
      <MapToolbar />
      <div className="canvas-wrap">
        {dragging ? <div className="drop-overlay">Отпустите .json / .appmap</div> : null}

        {lastLoadError ? (
          <div className="error-banner" role="alert">
            <div className="error-banner__body">
              <strong>Ошибка загрузки</strong>
              <span>{lastLoadError}</span>
            </div>
            <button type="button" className="btn" onClick={() => clearLoadError()}>
              Закрыть
            </button>
          </div>
        ) : null}

        {mapDocument && parseIssues.length > 0 ? (
          <div className="warnings-banner" role="status">
            <strong>Предупреждения parse ({parseIssues.length})</strong>
            <ul>
              {parseIssues.slice(0, 6).map((d, i) => (
                <li key={`${d.code}-${i}`}>
                  {d.message}
                  {d.path ? ` · ${d.path}` : ''}
                </li>
              ))}
            </ul>
            {parseIssues.length > 6 ? (
              <span className="drawer__hint">…и ещё {parseIssues.length - 6}</span>
            ) : null}
          </div>
        ) : null}

        {!mapDocument ? (
          <div className="empty-state">
            <div className="empty-state__card">
              <h1>Live App Map</h1>
              <p>
                Загрузите <code>liveappmap</code> / enterprise JSON / <code>.appmap</code> или
                откройте пресет Korbor.
              </p>
              <p>
                Для miniapp переключайте роль <strong>рекрутер</strong> /{' '}
                <strong>клиент (employer)</strong> — query <code>lam_role</code> попадёт в iframe
                URL.
              </p>
              <div className="empty-state__actions">
                {KORBOR_PRESETS.map((p) => {
                  const busy = loadingPresetId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="btn btn--primary empty-state__cta"
                      disabled={loadingPresetId !== null}
                      aria-busy={busy}
                      onClick={() => void loadPreset(p)}
                    >
                      {busy ? 'Загрузка…' : p.label}
                    </button>
                  );
                })}
              </div>
              <p className="drawer__hint">
                Либо перетащите файл на холст / «Открыть…» в тулбаре.
              </p>
            </div>
          </div>
        ) : (
          <>
            <AppMapCanvas />
            <StateInjectPanel />
          </>
        )}
      </div>
      <footer className="status-bar">
        <span>mode: {mode}</span>
        <span className="budget-pill budget-pill--inline">
          live {liveCount}/{maxLiveIframes}
        </span>
        <span className="budget-pill budget-pill--inline">
          pin {pinCount}/{DEFAULT_MAX_PINNED}
        </span>
        <span>role: {globalRole || '—'}</span>
        <span>
          nodes:{' '}
          {mapDocument?.nodes.filter((n) => n.kind === 'page').length ?? 0}
        </span>
        <span>warnings: {parseIssues.length}</span>
      </footer>
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
