/**
 * Shell Live App Map Visualizer.
 */
import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { MapToolbar } from './components/MapToolbar';
import { StateInjectPanel } from './components/StateInjectPanel';
import { AppMapCanvas } from './flow/AppMapCanvas';
import { useAppStore } from './store/app-store';

export function App() {
  const document = useAppStore((s) => s.document);
  const toast = useAppStore((s) => s.toast);
  const setToast = useAppStore((s) => s.setToast);
  const loadUnknownJson = useAppStore((s) => s.loadUnknownJson);
  const setBaseUrlOverride = useAppStore((s) => s.setBaseUrlOverride);
  const setMode = useAppStore((s) => s.setMode);
  const liveCount = useAppStore((s) => s.livePageIds.size);
  const pinCount = useAppStore((s) => s.pinnedPageIds.size);
  const mode = useAppStore((s) => s.mode);
  const parseIssues = useAppStore((s) => s.parseIssues);
  const globalRole = useAppStore((s) => s.globalRole);
  const [dragging, setDragging] = useState(false);

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
        .then((r) => r.json())
        .then((json: unknown) => {
          loadUnknownJson(json);
          setMode('live');
        })
        .catch((err: unknown) => {
          setToast(err instanceof Error ? err.message : String(err));
        });
    }
  }, [loadUnknownJson, setBaseUrlOverride, setMode, setToast]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast, setToast]);

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
          setToast(result.errors.join('; '));
          return;
        }
        loadUnknownJson(result.document);
        return;
      }
      try {
        loadUnknownJson(JSON.parse(await file.text()) as unknown);
      } catch {
        setToast('Не удалось прочитать файл');
      }
    },
    [loadUnknownJson, setToast],
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
        {!document ? (
          <div className="empty-state">
            <div className="empty-state__card">
              <h1>Live App Map</h1>
              <p>
                Загрузите <code>liveappmap</code> / enterprise JSON / <code>.appmap</code> или
                откройте пресет Korbor: Admin, Miniapp, Site.
              </p>
              <p>
                Для miniapp переключайте роль <strong>рекрутер</strong> /{' '}
                <strong>клиент (employer)</strong> — query <code>lam_role</code> попадёт в iframe
                URL.
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
        <span>live iframes: {liveCount}</span>
        <span>pinned: {pinCount}</span>
        <span>role: {globalRole || '—'}</span>
        <span>
          nodes:{' '}
          {document?.nodes.filter((n) => n.kind === 'page').length ?? 0}
        </span>
        <span>warnings: {parseIssues.length}</span>
      </footer>
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
