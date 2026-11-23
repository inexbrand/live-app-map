/**
 * Типы store визуализатора: состояние разделено на срезы по видам, store — их объединение.
 */
import type { GraphIndex } from '@live-app-map/graph';
import type { ViewMode } from '@live-app-map/iframe-policy';
import type { AppMapDocument, AppMapPageState, DeviceViewport, Diagnostic, DocsModel } from '@live-app-map/schema';
import type { StateCreator } from 'zustand';

/** Display scale ноды на холсте (viewport 1920×1080 * scale = preview). */
export type IframeScale = 0.25 | 0.35 | 0.5 | 0.75 | 1;

export type ActiveStateSel = {
  readonly pageId: string;
  readonly stateName: string;
};

/** Запись журнала visualizer / per-page (load, error, info). */
export type AppLogEntry = {
  readonly id: string;
  readonly ts: string;
  readonly level: 'info' | 'warn' | 'error';
  /** system | pageId */
  readonly source: string;
  readonly message: string;
};

/** Открытая карта: документ, индекс, ошибки разбора, базовый URL. */
export type MapSlice = {
  document: AppMapDocument | null;
  index: GraphIndex | null;
  parseIssues: Diagnostic[];
  /** Персистентная ошибка загрузки/parse (не только toast 4с) */
  lastLoadError: string | null;
  /** Номер загрузки карты: после сброса видимости ноды сообщают её заново (одна и та же карта может загрузиться дважды). */
  loadSeq: number;
  baseUrlOverride: string;
  loadDocument: (doc: AppMapDocument, warnings?: readonly Diagnostic[]) => void;
  /** Разбирает liveappmap / enterprise JSON; false — ошибка уже в lastLoadError */
  loadUnknownJson: (raw: unknown) => boolean;
  /** Заменяет раздел docs открытой карты (документация с диска, отметка пункта 09-bugs). */
  setDocs: (docs: DocsModel) => void;
  clearMap: () => void;
  clearLoadError: () => void;
  setBaseUrlOverride: (url: string) => void;
  setLastLoadError: (msg: string | null) => void;
};

/** Выбор на карте: поиск, выбранный экран и его соседи, роут в фокусе. */
export type SelectionSlice = {
  searchQuery: string;
  selectedPageId: string | null;
  /** Роут, к которому перешли из панели экрана: в панели сервиса он выделен и первым. */
  codeFocusRouteId: string | null;
  highlightedPageIds: ReadonlySet<string>;
  setSearchQuery: (q: string) => void;
  selectPage: (id: string | null) => void;
  /** Открыть сервис и выделить в его панели роут. */
  focusRoute: (serviceId: string, routeId: string) => void;
};

/** Живые iframe: бюджет, закреплённые, видимые, стейты, роль и live URL. */
export type LiveSlice = {
  mode: ViewMode;
  iframeScale: IframeScale;
  maxLiveIframes: number;
  /** Keep-alive слотов сверх live (LRU). */
  maxWarmIframes: number;
  pinnedPageIds: ReadonlySet<string>;
  visiblePageIds: ReadonlySet<string>;
  /** Активный live-бюджет (viewport/pin priority). */
  livePageIds: ReadonlySet<string>;
  /**
   * Warm keep-alive: iframe в DOM, state SPA не сбрасывается.
   * Не пересекается с livePageIds.
   */
  warmPageIds: ReadonlySet<string>;
  /** LRU warm, oldest first. */
  warmLruOrder: readonly string[];
  /** live ∪ warm — монтировать iframe. */
  mountedPageIds: ReadonlySet<string>;
  interactPageId: string | null;
  /** Активный инжект стейта по page id */
  activeStates: ReadonlyMap<string, string>;
  /** Глобальная роль (Korbor): employer | recruiter | '' */
  globalRole: string;
  setMode: (mode: ViewMode) => void;
  setIframeScale: (s: IframeScale) => void;
  setMaxLiveIframes: (n: number) => void;
  setMaxWarmIframes: (n: number) => void;
  togglePin: (id: string) => void;
  setVisible: (ids: ReadonlySet<string>) => void;
  setGlobalRole: (role: string) => void;
  applyPageState: (pageId: string, state: AppMapPageState | null) => void;
  setInteract: (id: string | null) => void;
  openPageInNewTab: (id: string) => void;
  /**
   * Собирает live URL с учётом globalRole и per-page state inject.
   * Per-page inject.role перекрывает global; query стейта мержится поверх.
   */
  resolveLiveUrl: (id: string) => string | null;
  recomputeLive: () => void;
};

/** Размеры окон экранов: адаптив карты, override ноды, измеренная высота. */
export type ViewportSlice = {
  /** Runtime override размера окна (адаптив / пресет ширины) */
  nodeViewports: ReadonlyMap<string, DeviceViewport>;
  /**
   * Измеренная высота document iframe (heightMode=auto).
   * key = pageId, value = scrollHeight px.
   */
  contentHeights: ReadonlyMap<string, number>;
  setNodeViewport: (pageId: string, viewport: DeviceViewport | null) => void;
  getNodeViewport: (pageId: string) => DeviceViewport | undefined;
  /** Записать измеренную высоту контента (auto); no-op при шуме */
  setContentHeight: (pageId: string, height: number) => void;
  /**
   * Глобальная адаптивка карты: layout.defaultDeviceViewport (+ width/height/mode).
   * Сбрасывает per-page runtime overrides и contentHeights (fixed path).
   */
  setMapDeviceViewport: (viewport: DeviceViewport) => void;
  /** Применить builtin/layout preset id как map-level adaptive */
  setMapViewportPreset: (presetId: string) => void;
};

/** Журнал и toast. */
export type LogSlice = {
  /** Журнал системы и per-page load/error */
  logs: readonly AppLogEntry[];
  toast: string | null;
  pushLog: (entry: Omit<AppLogEntry, 'id' | 'ts'> & { readonly ts?: string }) => void;
  clearLogs: () => void;
  setToast: (msg: string | null) => void;
};

/** Вход dogfood и TLS-proxy; хранятся в localStorage. */
export type DogfoodSlice = {
  /**
   * Dogfood: raw Telegram initData для miniapp (?lam_init_data=).
   * Сохраняется в localStorage visualizer origin.
   */
  dogfoodMiniappInitData: string;
  /** Dogfood: admin access token (?lam_access_token=) */
  dogfoodAdminAccessToken: string;
  /**
   * Self-signed HTTPS → same-origin proxy visualizer (/__lam_proxy/…).
   * По умолчанию включено для dogfood miniapp.
   */
  useTlsProxy: boolean;
  setDogfoodMiniappInitData: (raw: string) => void;
  setDogfoodAdminAccessToken: (token: string) => void;
  setUseTlsProxy: (enabled: boolean) => void;
};

/** Весь store визуализатора. */
export type AppStore = MapSlice & SelectionSlice & LiveSlice & ViewportSlice & LogSlice & DogfoodSlice;

/** Создатель среза: видит весь store, отдаёт свою часть. */
export type AppSlice<T> = StateCreator<AppStore, [], [], T>;
