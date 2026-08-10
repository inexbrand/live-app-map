/**
 * Тулбар: загрузка, mode, scale, роль, baseUrl, пресеты Korbor.
 */
import { useAppStore } from '../store/app-store';

const KORBOR_PRESETS = [
  {
    id: 'miniapp',
    label: 'Korbor Miniapp',
    path: '/maps/korbor-miniapp.liveappmap.json',
    baseUrl: 'https://vite.localhost:5175',
  },
  {
    id: 'admin',
    label: 'Korbor Admin',
    path: '/maps/korbor-admin.liveappmap.json',
    baseUrl: 'http://localhost:16002',
  },
  {
    id: 'site',
    label: 'Korbor Site',
    path: '/maps/korbor-site.liveappmap.json',
    baseUrl: 'http://localhost:16001',
  },
] as const;

export function MapToolbar() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const iframeScale = useAppStore((s) => s.iframeScale);
  const setIframeScale = useAppStore((s) => s.setIframeScale);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const baseUrlOverride = useAppStore((s) => s.baseUrlOverride);
  const setBaseUrlOverride = useAppStore((s) => s.setBaseUrlOverride);
  const globalRole = useAppStore((s) => s.globalRole);
  const setGlobalRole = useAppStore((s) => s.setGlobalRole);
  const loadUnknownJson = useAppStore((s) => s.loadUnknownJson);
  const clearMap = useAppStore((s) => s.clearMap);
  const setToast = useAppStore((s) => s.setToast);
  const document = useAppStore((s) => s.document);
  const liveCount = useAppStore((s) => s.livePageIds.size);
  const pinCount = useAppStore((s) => s.pinnedPageIds.size);

  const onFile = async (file: File | null) => {
    if (!file) {
      return;
    }
    if (file.name.endsWith('.appmap') || file.name.endsWith('.zip')) {
      const { parseAppMapZip } = await import('@live-app-map/export-appmap');
      const buf = await file.arrayBuffer();
      const result = await parseAppMapZip(buf);
      if (!result.ok) {
        setToast(result.errors.join('; '));
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
      setToast('Файл не JSON');
    }
  };

  const loadPreset = async (preset: (typeof KORBOR_PRESETS)[number]) => {
    try {
      const res = await fetch(preset.path);
      if (!res.ok) {
        setToast(`Не удалось загрузить ${preset.path}: ${res.status}`);
        return;
      }
      const json = (await res.json()) as unknown;
      setBaseUrlOverride(preset.baseUrl);
      loadUnknownJson(json);
      setMode('live');
      setToast(`${preset.label} · baseUrl ${preset.baseUrl}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setToast(message);
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
        {KORBOR_PRESETS.map((p) => (
          <button key={p.id} type="button" className="btn btn--primary" onClick={() => void loadPreset(p)}>
            {p.label}
          </button>
        ))}
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

      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
        live {liveCount}/{useAppStore.getState().maxLiveIframes} · pin {pinCount}
      </span>
    </header>
  );
}
