/**
 * Shell Live App Map Visualizer (UI kit + feedback).
 */
import { AlertTriangle, X } from 'lucide-react';
import { useCallback, useEffect, useState, type DragEvent } from 'react';
import type { AppMapDocument } from '@live-app-map/schema';
import { CommentPopover } from './components/comments/CommentPopover';
import { CommentsSheet } from './components/comments/CommentsSheet';
import { FocusBar } from './components/FocusBar';
import { VoiceModelDialog } from './components/comments/VoiceModelDialog';
import { LamGrabHost } from './components/LamGrabHost';
import { MapToolbar } from './components/MapToolbar';
import { SnapshotOverlay } from './components/SnapshotOverlay';
import { StateInjectPanel } from './components/StateInjectPanel';
import { AppMapCanvas } from './flow/AppMapCanvas';
import { ApiView } from './components/ApiView';
import { DatabaseView } from './components/DatabaseView';
import { DocsView } from './components/DocsView';
import { ComponentsView } from './components/components-view/ComponentsView';
import { CompareView } from './components/CompareView';
import { useMapSourceStore } from './store/map-source-store';
import { useViewStore } from './store/view-store';
import { useGatewayFrames } from './lib/gateway/use-gateway-frames';
import { useStreamSync } from './lib/stream/stream-sync';
import { useProjectStates } from './lib/project-states';
import { useRouteSamples } from './lib/use-route-samples';
import { useNavHistory } from './lib/use-nav-history';
import { useHotkeys } from './lib/use-hotkeys';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { fetchJsonFile } from './lib/load-error';
import { ensureDogfoodSessions } from './lib/ensure-dogfood-sessions';
import { importMapFile } from './lib/import-map';
import { loadMapPresetIntoStore } from './lib/load-map-preset';
import {
  fetchMapCatalog,
  type MapCatalogEntry,
} from './lib/map-catalog';
import { useAppStore } from './store/app-store';
import { Button } from '@/components/ui/button';

type LoadError = (msg: string) => void;

/** Ошибка загрузки карты — в баннере (один раз, без дубля во всплывающем сообщении). */
function reportLoadError(msg: string): void {
  useAppStore.getState().setLastLoadError(msg);
}

/** Каталог карт: записи, ошибка, идёт ли загрузка. */
function useMapCatalog(): { readonly catalog: readonly MapCatalogEntry[]; readonly error: string | null; readonly loading: boolean } {
  const [catalog, setCatalog] = useState<readonly MapCatalogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchMapCatalog().then((res) => {
      if (cancelled) {
        return;
      }
      setLoading(false);
      setError(res.ok ? null : res.error);
      setCatalog(res.ok ? res.catalog.maps : []);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return { catalog, error, loading };
}

/** Dogfood-сессии после загрузки карты (роль, токены). */
async function runDogfoodAfterMapLoad(): Promise<void> {
  const s = useAppStore.getState();
  await ensureDogfoodSessions({
    dogfoodAdminAccessToken: s.dogfoodAdminAccessToken,
    dogfoodMiniappInitData: s.dogfoodMiniappInitData,
    setDogfoodAdminAccessToken: s.setDogfoodAdminAccessToken,
    setDogfoodMiniappInitData: s.setDogfoodMiniappInitData,
    onToast: s.setToast,
  });
}

/** Карта из каталога: загрузка, источник, dogfood, toast с адресом приложения. */
async function loadCatalogPreset(preset: MapCatalogEntry): Promise<void> {
  const app = useAppStore.getState();
  const res = await loadMapPresetIntoStore(preset, {
    setBaseUrlOverride: app.setBaseUrlOverride,
    loadUnknownJson: app.loadUnknownJson,
    setMode: app.setMode,
  });
  if (!res.ok) {
    reportLoadError(res.error);
    return;
  }
  useMapSourceStore.getState().setSource({ kind: 'catalog', id: preset.id, label: preset.label, path: preset.path });
  await runDogfoodAfterMapLoad();
  const baseHint = preset.baseUrl.trim() !== '' ? ` · ${preset.baseUrl}` : '';
  useAppStore.getState().setToast(`${preset.label}${baseHint}`);
}

/** Выбор карты из каталога; id загружаемой — для «Загрузка…» на кнопке. */
function useLoadPreset(): { readonly loadingId: string | null; readonly load: (preset: MapCatalogEntry) => void } {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const load = useCallback((preset: MapCatalogEntry) => {
    setLoadingId(preset.id);
    void loadCatalogPreset(preset).finally(() => setLoadingId(null));
  }, []);
  return { loadingId, load };
}

/** Карта по ссылке: JSON по адресу, режим live, dogfood; отменённая (эффект снят) — не загружается. */
async function loadLinkedMap(map: string, onError: LoadError, cancelled: () => boolean): Promise<void> {
  const r = await fetchJsonFile('Карта', map);
  if (cancelled()) {
    return;
  }
  if (!r.ok) {
    onError(r.error);
    return;
  }
  const app = useAppStore.getState();
  app.loadUnknownJson(r.json);
  app.setMode('live');
  // Deep-link / refresh: auto dogfood (раньше только через select карты)
  await runDogfoodAfterMapLoad();
}

/**
 * Параметры адреса ?baseUrl=&role=&map= применяются один раз при открытии.
 * StrictMode в dev зовёт эффект дважды: первая загрузка карты отменяется, иначе
 * вторая loadDocument сбрасывала экран, выбранный между ними.
 *
 * @returns отмена загрузки карты
 */
function applyLocationParams(search: string): () => void {
  const params = new URLSearchParams(search);
  const baseUrl = params.get('baseUrl');
  const map = params.get('map');
  const role = params.get('role');
  if (baseUrl) {
    useAppStore.getState().setBaseUrlOverride(baseUrl);
  }
  if (role) {
    useAppStore.getState().setGlobalRole(role);
  }
  let cancelled = false;
  if (map) {
    loadLinkedMap(map, reportLoadError, () => cancelled).catch((err: unknown) => reportLoadError(err instanceof Error ? err.message : String(err)));
  }
  return () => {
    cancelled = true;
  };
}

/** Toast гаснет через 4 с; Esc закрывает toast и ошибку загрузки. */
function useToastAndEscape(): void {
  const toast = useAppStore((s) => s.toast);
  useEffect(() => {
    if (!toast) {
      return;
    }
    const t = window.setTimeout(() => useAppStore.getState().setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        useAppStore.getState().clearLoadError();
        useAppStore.getState().setToast(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Перетащенный файл карты: разбор, источник «файл», toast импорта. */
async function dropMapFile(file: File | undefined): Promise<void> {
  if (!file) {
    return;
  }
  const result = await importMapFile(file);
  if (!result.ok) {
    reportLoadError(result.error);
    return;
  }
  if (useAppStore.getState().loadUnknownJson(result.json)) {
    useMapSourceStore.getState().setSource({ kind: 'file', name: file.name });
  }
  if (result.toast !== undefined) {
    useAppStore.getState().setToast(result.toast);
  }
}

/** Перетаскивание файла карты в окно: подсветка и загрузка. */
function useMapDrop(): { readonly dragging: boolean; readonly handlers: { onDragOver: (e: DragEvent) => void; onDragLeave: () => void; onDrop: (e: DragEvent) => void } } {
  const [dragging, setDragging] = useState(false);
  return {
    dragging,
    handlers: {
      onDragOver: (e) => {
        e.preventDefault();
        setDragging(true);
      },
      onDragLeave: () => setDragging(false),
      onDrop: (e) => {
        e.preventDefault();
        setDragging(false);
        void dropMapFile(e.dataTransfer.files[0]);
      },
    },
  };
}

/** Баннер ошибки загрузки с крестиком. */
function LoadErrorBanner() {
  const lastLoadError = useAppStore((s) => s.lastLoadError);
  const clearLoadError = useAppStore((s) => s.clearLoadError);
  if (!lastLoadError) {
    return null;
  }
  return (
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
  );
}

/** Предупреждения разбора карты (первые шесть). */
function ParseIssuesBanner() {
  const hasMap = useAppStore((s) => s.document !== null);
  const parseIssues = useAppStore((s) => s.parseIssues);
  if (!hasMap || parseIssues.length === 0) {
    return null;
  }
  return (
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
  );
}

/** Кнопка карты каталога; подсказка — путь и число экранов. */
function PresetButton({ preset, loadingId, onLoad }: { readonly preset: MapCatalogEntry; readonly loadingId: string | null; readonly onLoad: (p: MapCatalogEntry) => void }) {
  const busy = loadingId === preset.id;
  return (
    <Button
      type="button"
      variant="default"
      disabled={loadingId !== null}
      aria-busy={busy}
      title={preset.pageCount > 0 ? `${preset.path} · ${preset.pageCount} экранов` : preset.path}
      onClick={() => onLoad(preset)}
    >
      {busy ? 'Загрузка…' : preset.label}
    </Button>
  );
}

/** Экран без карты: каталог и подсказки. */
function EmptyState({ catalog, catalogError, catalogLoading }: { readonly catalog: readonly MapCatalogEntry[]; readonly catalogError: string | null; readonly catalogLoading: boolean }) {
  const { loadingId, load } = useLoadPreset();
  return (
    <div className="empty-state">
      <div className="empty-state__card">
        <h1>Выберите карту проекта</h1>
        <p>
          Карта показывает экраны приложения вживую, его API, базу данных и документацию задач.
          Выберите проект ниже или перетащите файл карты в это окно.
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
          {catalog.map((p) => (
            <PresetButton key={p.id} preset={p} loadingId={loadingId} onLoad={load} />
          ))}
        </div>
        <p className="drawer__hint">
          Поиск по всему проекту — ⌘K, все клавиши — ?
        </p>
      </div>
    </div>
  );
}

/** Полоска «на холсте только экраны …» с «Показать все». */
function CanvasFilterBar() {
  const canvasFilter = useAppStore((s) => s.searchQuery);
  const setCanvasFilter = useAppStore((s) => s.setSearchQuery);
  const appView = useViewStore((s) => s.view);
  if (appView !== 'screens' || canvasFilter.trim() === '') {
    return null;
  }
  return (
    <div className="canvas-filter" role="status" data-testid="canvas-filter">
      <span>
        На холсте только экраны «{canvasFilter.trim()}»
      </span>
      <Button type="button" size="sm" variant="ghost" onClick={() => setCanvasFilter('')}>
        Показать все
      </Button>
    </div>
  );
}

/** Вид карты: API, база (если есть таблицы), документация, сравнение или холст экранов. */
function MainView({ doc }: { readonly doc: AppMapDocument }) {
  const appView = useViewStore((s) => s.view);
  /** Номер загрузки карты: вид «Сравнение» начинается заново для новой карты. */
  const loadSeq = useAppStore((s) => s.loadSeq);
  switch (appView) {
    case 'api':
      return <ApiView />;
    case 'database':
      return doc.code !== undefined && doc.code.tables.length > 0 ? <DatabaseView /> : <AppMapCanvas />;
    case 'docs':
      return <DocsView />;
    case 'components':
      return <ComponentsView />;
    case 'compare':
      return <CompareView key={loadSeq} />;
    default:
      return <AppMapCanvas />;
  }
}

/** Открытая карта: полоска фильтра, вид и панели поверх. */
function MapArea({ doc }: { readonly doc: AppMapDocument }) {
  const appView = useViewStore((s) => s.view);
  return (
    <div className="canvas-wrap">
      {/* Виды «API», «База данных», «Документация» снимают холст целиком: живые iframe не держат память. */}
      <CanvasFilterBar />
      <MainView doc={doc} />
      {appView === 'screens' ? <FocusBar /> : null}
      {appView === 'screens' ? <StateInjectPanel /> : null}
      <CommentsSheet />
      <SnapshotOverlay />
    </div>
  );
}

/** Toast внизу окна. */
function Toast() {
  const toast = useAppStore((s) => s.toast);
  return toast ? (
    <div className="toast" role="status">
      {toast}
    </div>
  ) : null;
}

/**
 * Корневой shell.
 */
export function App() {
  const mapDocument = useAppStore((s) => s.document);
  useGatewayFrames();
  useStreamSync();
  useProjectStates();
  useRouteSamples();
  useNavHistory();
  useHotkeys(mapDocument !== null);
  useToastAndEscape();
  useEffect(() => applyLocationParams(window.location.search), []);
  const { catalog, error: catalogError, loading: catalogLoading } = useMapCatalog();
  const { dragging, handlers } = useMapDrop();

  return (
    <div className={`app-shell${dragging ? ' app-shell--drag' : ''}`} {...handlers}>
      <MapToolbar catalog={catalog} catalogLoading={catalogLoading} />
      <LamGrabHost />
      <div className="app-main">
        <LoadErrorBanner />
        <ParseIssuesBanner />
        {mapDocument ? <MapArea doc={mapDocument} /> : <EmptyState catalog={catalog} catalogError={catalogError} catalogLoading={catalogLoading} />}
      </div>
      <CommentPopover />
      <VoiceModelDialog />
      <CommandPalette />
      <ShortcutsHelp />
      <Toast />
    </div>
  );
}
