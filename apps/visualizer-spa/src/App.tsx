/**
 * Shell Live App Map Visualizer (UI kit + feedback).
 */
import { AlertTriangle, X } from 'lucide-react';
import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { FeedbackPanel } from './components/FeedbackPanel';
import { MapToolbar } from './components/MapToolbar';
import { StateInjectPanel } from './components/StateInjectPanel';
import { AppMapCanvas } from './flow/AppMapCanvas';
import {
  fetchKorborPreset,
  KORBOR_PRESETS,
  type KorborPreset,
} from './korbor-presets';
import { importMapFile } from './lib/import-map';
import { DEFAULT_MAX_PINNED, useAppStore } from './store/app-store';
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
        setToast(`${preset.label} · ${preset.baseUrl}`);
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
        window.document.querySelector<HTMLInputElement>('input[data-lam-search]')?.focus();
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
        {dragging ? (
          <div className="drop-overlay">Отпустите .json / .appmap</div>
        ) : null}

        {lastLoadError ? (
          <div className="error-banner" role="alert">
            <div className="error-banner__body">
              <strong>
                <AlertTriangle
                  size={14}
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
              <h1>Live App Map</h1>
              <p>
                Загрузите карту или откройте пресет Korbor. Live iframe на dogfood
                (localhost / *.localhost) — trusted sandbox. Роли miniapp: recruiter /
                employer.
              </p>
              <p>
                Feedback: выберите экран → опишите дефект слева → скопируйте промпт или
                JSON для CLI.
              </p>
              <div className="empty-state__actions">
                {KORBOR_PRESETS.map((p) => {
                  const busy = loadingPresetId === p.id;
                  return (
                    <Button
                      key={p.id}
                      type="button"
                      variant="primary"
                      disabled={loadingPresetId !== null}
                      aria-busy={busy}
                      onClick={() => void loadPreset(p)}
                    >
                      {busy ? 'Загрузка…' : p.label}
                    </Button>
                  );
                })}
              </div>
              <p className="drawer__hint">
                <code>bun run dev</code> → http://localhost:4310
              </p>
            </div>
          </div>
        ) : (
          <>
            <AppMapCanvas />
            <FeedbackPanel />
            <StateInjectPanel />
          </>
        )}
      </div>
      <footer className="status-bar">
        <span>
          mode: <strong>{mode}</strong>
        </span>
        <span>
          live <strong>{liveCount}/{maxLiveIframes}</strong>
        </span>
        <span>
          pin <strong>{pinCount}/{DEFAULT_MAX_PINNED}</strong>
        </span>
        <span>
          role: <strong>{globalRole || '—'}</strong>
        </span>
        <span>
          nodes:{' '}
          <strong>
            {mapDocument?.nodes.filter((n) => n.kind === 'page').length ?? 0}
          </strong>
        </span>
        <span>
          warnings: <strong>{parseIssues.length}</strong>
        </span>
      </footer>
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
