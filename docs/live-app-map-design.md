# Live App Map Visualizer — Technical Design Document

**Версия документа:** 1.1  
**Дата:** 2026-08-10  
**Статус:** Implemented / partial — SPA [`apps/visualizer-spa`](../apps/visualizer-spa) на порту **4310**  
**Стек:** Bun workspaces monorepo · React 19 + TypeScript + Vite + `@xyflow/react` + Zustand · Zod schemas · pure `iframe-policy`

> **Канон продукта (enterprise):** см. [`live-app-map-enterprise-tdd.md`](./live-app-map-enterprise-tdd.md) — scanner, monorepo packages, Next integration, plugins, roadmap.  
> Этот файл — seed по JSON-формату viewer + iframe freeze; остаётся reference для visualizer/export.  
> **Код уже в репозитории** (не «design only»): monorepo + standalone SPA.

### Где лежит реализация

| Что | Путь |
|-----|------|
| Visualizer SPA (dev **http://localhost:4310**) | [`apps/visualizer-spa`](../apps/visualizer-spa) |
| Схема / parse / convert | [`packages/schema`](../packages/schema) |
| Graph index / search / URL + state inject | [`packages/graph`](../packages/graph) |
| Бюджет iframe (pure reconcile) | [`packages/iframe-policy`](../packages/iframe-policy) |
| Export `.appmap` | [`packages/export-appmap`](../packages/export-appmap) |
| CLI `scan` / `diff` / `doctor` | [`packages/cli`](../packages/cli) |
| Scanners (Next, React Router, core) | [`packages/scanner-*`](../packages) |
| Embed / Devtools shell | [`packages/react`](../packages/react) |
| Korbor maps (dogfood) | [`maps/`](../maps) + [`apps/visualizer-spa/public/maps/`](../apps/visualizer-spa/public/maps) |

### Проверка (корень monorepo)

```bash
bun install
bun test packages apps/visualizer-spa
bun run typecheck
bun run scan:korbor
bun run dev:visualizer
```

Открыть: http://localhost:4310 → пресеты **Korbor Miniapp / Admin / Site**. Полный список пакетов и CLI — в [`README.md`](../README.md).

---

## 1. Цель продукта

**Live App Map Visualizer** — React SPA, которое принимает описание навигации веб-сайта (локального или удалённого) и рисует интерактивную карту страниц.

Ключевые отличия от «скриншотных» карт (типа expo-map):

1. Каждая страница — **нода React Flow** с **живым `iframe`**, который реально загружает URL (обычно `http://localhost:…`).
2. Пользователь видит **работающий** UI внутри карты, а не статичные PNG.
3. Iframe тяжёлые → обязательна **умная заморозка**: в viewport — живые, вне viewport — выгружены; важные страницы можно **закрепить (pin)**.

Вход:

- файл `.appmap` (zip-бандл в формате [aleqsio/expo-map](https://github.com/aleqsio/expo-map) v2);
- простой JSON своего формата **`liveappmap`** (описан ниже).

---

## 2. Нативный JSON-формат `liveappmap`

### 2.1. Принципы

| Принцип | Правило |
|--------|---------|
| Версионирование | Обязательное поле `version` (semver-строка или целое major). Парсер отклоняет major, который не поддерживает. |
| Расширяемость | Неизвестные поля **игнорируются**, не ломают parse. |
| Минимальный граф | `pages` + `edges` достаточно для карты. |
| URL-first | Для live iframe нужен абсолютный или резолвящийся `url` / `path` + `baseUrl`. |
| Стабильные id | `id` — строка, уникальная в рамках файла; edges ссылаются только на существующие id. |

### 2.2. Корневая схема (TypeScript-ориентированная)

```ts
/** Корневой документ liveappmap */
type LiveAppMapDocument = {
  /** Версия формата, напр. "1.0" или 1 */
  version: string | number;
  /** Метаданные приложения (опционально) */
  app?: LiveAppMapAppMeta;
  /**
   * Базовый URL для резолва относительных path.
   * Пример: "http://localhost:5173"
   */
  baseUrl?: string;
  /** Страницы / экраны (ноды графа) */
  pages: LiveAppMapPage[];
  /** Переходы навигации */
  edges: LiveAppMapEdge[];
  /** Именованные группы (layout / фильтр / цвет) */
  groups?: LiveAppMapGroup[];
  /** Опциональные layout-подсказки (позиции из редактора) */
  layout?: LiveAppMapLayoutHints;
  /**
   * Расширения сторонних тулов — парсер не валидирует содержимое.
   * Ключи: reverse-DNS или camelCase namespace.
   */
  extensions?: Record<string, unknown>;
};

type LiveAppMapAppMeta = {
  name?: string;
  description?: string;
  /** web | ios | android | desktop — для UI-бейджей */
  platform?: 'web' | 'ios' | 'android' | 'desktop' | string;
  /** ISO-8601 */
  generatedAt?: string;
  generator?: string;
};

type LiveAppMapPage = {
  /** Уникальный id (стабильный ключ) */
  id: string;
  /** Отображаемое имя */
  title: string;
  /**
   * Относительный path (резолвится через baseUrl).
   * Пример: "/dashboard", "/users/:id"
   */
  path?: string;
  /**
   * Абсолютный URL для iframe. Если есть и path, url имеет приоритет
   * для live-загрузки.
   */
  url?: string;
  /** id группы из groups[] или свободная строка */
  group?: string;
  /**
   * Тип страницы для иконки/цвета:
   * route | modal | auth | error | settings | external | other
   */
  type?: LiveAppMapPageType;
  /** Состояния UI (empty, loading, error, logged-out, …) */
  states?: LiveAppMapPageState[];
  /** Путь к скриншоту (file: в бандле или data-URL / http) */
  screenshot?: string | null;
  /** Произвольные метаданные (теги, source file, feature flag) */
  metadata?: Record<string, unknown>;
  /** Подсказка позиции на canvas (если layout сохранён) */
  position?: { x: number; y: number };
  /**
   * Если true — iframe нельзя грузить (X-Frame / external).
   * UI покажет screenshot или placeholder.
   */
  iframeDisabled?: boolean;
  /** Начальный pin в live-режиме */
  defaultPinned?: boolean;
};

type LiveAppMapPageType =
  | 'route'
  | 'modal'
  | 'auth'
  | 'error'
  | 'settings'
  | 'external'
  | 'other'
  | string;

type LiveAppMapPageState = {
  name: string;
  /** URL/query, который приводит к этому состоянию (если известно) */
  url?: string;
  screenshot?: string | null;
  note?: string;
};

type LiveAppMapEdge = {
  /** Уникальный id ребра (опционально; иначе `${from}->${to}#${i}`) */
  id?: string;
  /** id страницы-источника */
  from: string;
  /** id страницы-цели */
  to: string;
  /** Подпись на edge (label кнопки / "navigate") */
  label?: string;
  /**
   * kind: navigation | link | redirect | deep-link | back | unknown
   */
  kind?: string;
  /** Исходное выражение / raw (из статического анализа) */
  raw?: string;
  metadata?: Record<string, unknown>;
};

type LiveAppMapGroup = {
  id: string;
  title: string;
  /** CSS color / token */
  color?: string;
  /** Порядок в легенде */
  order?: number;
};

type LiveAppMapLayoutHints = {
  /** elk | dagre | manual | none */
  algorithm?: string;
  /** Направление для auto-layout */
  direction?: 'TB' | 'LR' | 'BT' | 'RL';
  /** Масштаб viewport при открытии */
  defaultViewport?: { x: number; y: number; zoom: number };
};
```

### 2.3. JSON Schema (упрощённая, для документации / AJV)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://local/schemas/liveappmap-1.0.json",
  "title": "LiveAppMap",
  "type": "object",
  "required": ["version", "pages", "edges"],
  "additionalProperties": true,
  "properties": {
    "version": { "oneOf": [{ "type": "string" }, { "type": "number" }] },
    "baseUrl": { "type": "string" },
    "app": { "type": "object", "additionalProperties": true },
    "pages": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["id", "title"],
        "additionalProperties": true,
        "properties": {
          "id": { "type": "string", "minLength": 1 },
          "title": { "type": "string" },
          "path": { "type": "string" },
          "url": { "type": "string" },
          "group": { "type": "string" },
          "type": { "type": "string" },
          "states": { "type": "array" },
          "screenshot": { "type": ["string", "null"] },
          "metadata": { "type": "object" },
          "position": {
            "type": "object",
            "properties": {
              "x": { "type": "number" },
              "y": { "type": "number" }
            },
            "required": ["x", "y"]
          },
          "iframeDisabled": { "type": "boolean" },
          "defaultPinned": { "type": "boolean" }
        }
      }
    },
    "edges": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["from", "to"],
        "additionalProperties": true,
        "properties": {
          "id": { "type": "string" },
          "from": { "type": "string" },
          "to": { "type": "string" },
          "label": { "type": "string" },
          "kind": { "type": "string" },
          "raw": { "type": "string" },
          "metadata": { "type": "object" }
        }
      }
    },
    "groups": { "type": "array" },
    "layout": { "type": "object", "additionalProperties": true },
    "extensions": { "type": "object" }
  }
}
```

### 2.4. Полный пример JSON

```json
{
  "version": "1.0",
  "baseUrl": "http://localhost:5173",
  "app": {
    "name": "Demo Shop",
    "platform": "web",
    "generator": "hand-written/1.0",
    "generatedAt": "2026-08-10T12:00:00.000Z"
  },
  "groups": [
    { "id": "auth", "title": "Auth", "color": "#f59e0b", "order": 0 },
    { "id": "catalog", "title": "Catalog", "color": "#3b82f6", "order": 1 },
    { "id": "checkout", "title": "Checkout", "color": "#22c55e", "order": 2 }
  ],
  "pages": [
    {
      "id": "home",
      "title": "Home",
      "path": "/",
      "group": "catalog",
      "type": "route",
      "defaultPinned": true,
      "metadata": { "sourceFile": "src/pages/Home.tsx" }
    },
    {
      "id": "product",
      "title": "Product",
      "path": "/product/demo-sku",
      "group": "catalog",
      "type": "route",
      "states": [
        {
          "name": "out-of-stock",
          "url": "http://localhost:5173/product/demo-sku?stock=0",
          "note": "Empty CTA"
        }
      ]
    },
    {
      "id": "cart",
      "title": "Cart",
      "path": "/cart",
      "group": "checkout",
      "type": "route"
    },
    {
      "id": "login",
      "title": "Login",
      "path": "/login",
      "group": "auth",
      "type": "auth"
    },
    {
      "id": "checkout",
      "title": "Checkout",
      "path": "/checkout",
      "group": "checkout",
      "type": "route",
      "metadata": { "requiresAuth": true }
    },
    {
      "id": "docs-external",
      "title": "External Docs",
      "url": "https://example.com/docs",
      "type": "external",
      "iframeDisabled": true,
      "screenshot": null,
      "metadata": { "reason": "X-Frame-Options likely DENY" }
    }
  ],
  "edges": [
    { "from": "home", "to": "product", "label": "Open product", "kind": "navigation" },
    { "from": "product", "to": "cart", "label": "Add to cart", "kind": "navigation" },
    { "from": "cart", "to": "checkout", "label": "Checkout", "kind": "navigation" },
    { "from": "checkout", "to": "login", "label": "Need auth", "kind": "redirect" },
    { "from": "login", "to": "checkout", "label": "After login", "kind": "redirect" },
    { "from": "home", "to": "login", "label": "Sign in", "kind": "link" },
    { "from": "home", "to": "docs-external", "label": "Docs", "kind": "link" }
  ],
  "layout": {
    "algorithm": "dagre",
    "direction": "LR",
    "defaultViewport": { "x": 0, "y": 0, "zoom": 0.75 }
  }
}
```

### 2.5. Правила валидации при parse

1. `version` обязателен; major `1` поддерживается MVP.
2. `pages.length >= 1`; каждый `id` уникален.
3. У каждой page есть **хотя бы один** из: `url`, `path` (+ `baseUrl` на корне), иначе iframe disabled + warning.
4. `edges[].from` / `to` должны существовать в `pages`; битые ссылки → warning + edge drop (не hard-fail).
5. Self-edges допустимы (редко); дубликаты `(from,to,label)` — оставляем, React Flow требует unique `edge.id` (генерируем).
6. Резолв live URL:
   ```ts
   function resolvePageUrl(page, baseUrl): string | null {
     if (page.url) return page.url;
     if (page.path && baseUrl) return new URL(page.path, baseUrl).href;
     if (page.path?.startsWith('http')) return page.path;
     return null;
   }
   ```

---

## 3. Парсинг `.appmap` (aleqsio/expo-map v2)

### 3.1. Физический формат

`.appmap` — **обычный zip**:

```
myapp.appmap (zip)
├── manifest.json          # formatVersion, app meta
├── map.json               # nodes[], edges[], flows[] (v2: flows обычно [])
├── screens/*.png          # slug + state variants <slug>--<state>.png
└── flows/                 # optional; argent YAML — вне core live-iframe
    ├── <name>.yaml
    └── <name>.meta.json
```

Канон: `docs/appmap-format.md` в репозитории expo-map (formatVersion 2; viewers ignore unknown fields).

### 3.2. Алгоритм ingest

```
1. User drops / выбирает файл *.appmap | *.zip
2. JSZip.loadAsync(arrayBuffer)
3. Прочитать manifest.json (если нет — warning, продолжить с defaults)
4. Прочитать map.json (если нет — hard error)
5. Опционально: извлечь screens/* в Blob URL map (slug → objectURL)
6. flows/* — НЕ парсить в MVP (optional future)
7. mapAppMapToInternal(manifest, map, assets) → LiveAppMapDocument + AssetStore
8. Ошибки → ParseResult { ok:false, errors[], warnings[] }
```

### 3.3. Маппинг полей → internal model

| Источник (expo-map) | Куда в Live App Map | Примечание |
|---------------------|---------------------|------------|
| `manifest.formatVersion` | `extensions.appmap.formatVersion` + check | reject only if unreadable JSON; unknown major → warning |
| `manifest.generator` | `app.generator` | |
| `manifest.app.name` | `app.name` | |
| `manifest.app.platform` | `app.platform` | `ios-simulator` → `ios` (нормализация optional) |
| `manifest.app.scheme` | `app.metadata.scheme` / `extensions.appmap.scheme` | deep-link, не web baseUrl |
| `manifest.generatedAt` | `app.generatedAt` | |
| `map.nodes[].id` | `pages[].id` | |
| `map.nodes[].urlPath` | `pages[].path` | pattern вроде `/profile/:name` — **не** live URL сам по себе |
| `map.nodes[].file` | `pages[].metadata.sourceFile` | |
| `map.nodes[].slug` | `pages[].metadata.slug` | ключ для screenshot |
| `map.nodes[].group` | `pages[].group` | auto-create groups from unique values |
| `map.nodes[].navigator` | `pages[].metadata.navigator` | |
| `map.nodes[].params` | `pages[].metadata.params` | |
| `map.nodes[].presentation` | `pages[].type` map: `"modal"` → `modal`, else `route` | |
| `map.nodes[].stateHints` | `pages[].metadata.stateHints` | |
| `map.nodes[].capture.status` | `pages[].metadata.captureStatus` | |
| `map.nodes[].capture.note` | `pages[].metadata.captureNote` | |
| `map.nodes[].capture.screenshot` | `pages[].screenshot` | path → Blob URL из zip |
| `map.nodes[].capture.states[]` | `pages[].states[]` | name + screenshot blob |
| `map.nodes[].capture.needsNavigation` | `pages[].metadata.needsNavigation` | |
| `map.edges[].from` | `edges[].from` | |
| `map.edges[].to` | `edges[].to` | если `to === null` → drop + warning |
| `map.edges[].raw` | `edges[].raw` | |
| `map.edges[].target` | `edges[].metadata.target` | deep-link target path |
| `map.flows` / `flows/*` | out of core | optional future; not required for live iframe map |

### 3.4. Live URL из appmap (важный gap)

Expo-map заточен под **mobile / deep-link**, не под localhost web.

Стратегия:

1. UI после импорта: поле **Base URL** (default `http://localhost:8081` или сохранённый last-used).
2. Для каждой node: `url = baseUrl + normalize(urlPath)` где params (`:name`) заменяются demo-значениями из `metadata.params` или `"demo"`.
3. Если path не резолвится — `iframeDisabled: true`, показать screenshot из бандла.
4. Пользователь может править baseUrl и re-resolve без re-parse zip.

```ts
function materializeAppMapUrls(
  doc: LiveAppMapDocument,
  baseUrl: string,
): LiveAppMapDocument {
  return {
    ...doc,
    baseUrl,
    pages: doc.pages.map((p) => ({
      ...p,
      url: p.url ?? joinBase(baseUrl, fillParams(p.path, p.metadata)),
    })),
  };
}
```

### 3.5. Assets (screenshots)

- При unpack: `JSZip` → `blob` → `URL.createObjectURL`.
- Хранить в `AssetStore`: `Map<path, { objectUrl, revoke() }>`.
- На unload карты / новый файл — **revoke все** object URLs (memory leak guard).
- В live-режиме screenshot = fallback пока iframe loading / error / frozen.

### 3.6. Поверхность ошибок

```ts
type ParseIssue = {
  level: 'error' | 'warning';
  code:
    | 'INVALID_ZIP'
    | 'MISSING_MAP_JSON'
    | 'INVALID_JSON'
    | 'UNSUPPORTED_VERSION'
    | 'DUPLICATE_PAGE_ID'
    | 'DANGLING_EDGE'
    | 'NULL_EDGE_TARGET'
    | 'NO_URL'
    | 'ASSET_MISSING';
  message: string; // русский текст для UI
  path?: string;   // JSON pointer-ish: "pages[2].id"
};

type ParseResult =
  | { ok: true; document: LiveAppMapDocument; assets: AssetStore; warnings: ParseIssue[] }
  | { ok: false; errors: ParseIssue[]; warnings: ParseIssue[] };
```

UI: toast/banner с количеством warnings; errors блокируют canvas (empty state + «исправьте файл»).

### 3.7. Парсер native JSON

Отдельный entry: `parseLiveAppMapJson(text | object): ParseResult`.

- `JSON.parse` → schema validate (zod recommended) → normalize defaults.
- Тот же internal `LiveAppMapDocument`.
- Детект формата по расширению / magic:
  - `.appmap` / zip PK header → appmap pipeline;
  - `.json` → native pipeline;
  - если json имеет `nodes` + `urlPath` без `version`/`pages` → **heuristic**: treat as bare `map.json` from appmap (compat mode).

---

## 4. Архитектура приложения

### 4.1. Слои (строгое разделение)

```
┌─────────────────────────────────────────────────────────────┐
│  UI Shell (toolbar, theme, DnD overlay, search, toasts)     │
├─────────────────────────────────────────────────────────────┤
│  React Flow View Layer                                      │
│   - AppMapCanvas, PageNode, MapControls, Minimap            │
│   - selection / highlight / fitView                         │
├─────────────────────────────────────────────────────────────┤
│  Iframe Manager (критичный слой)                            │
│   - visibility registry, pin set, load budget, freeze FSM   │
├─────────────────────────────────────────────────────────────┤
│  Client Store (Zustand)                                     │
│   - document, mode, selection, pins, theme, iframeScale     │
├─────────────────────────────────────────────────────────────┤
│  Domain / Parsers                                           │
│   - parseLiveAppMapJson, parseAppMapZip, resolveUrls        │
│   - types, zod schemas, mappers                             │
└─────────────────────────────────────────────────────────────┘
```

**Правила зависимостей:**

- UI → store + React Flow + Iframe Manager API.
- React Flow nodes **не** парсят файлы и **не** владеют глобальным pin set.
- Iframe Manager **не** знает про zip/JSZip.
- Parsers **pure** (или async pure): input bytes/text → `ParseResult`, без React.

### 4.2. Внутренняя runtime-модель (после parse)

```ts
type AppMapGraph = {
  pages: Map<string, RuntimePage>;
  edges: RuntimeEdge[];
  adjacency: Map<string, { out: string[]; in: string[] }>;
  groups: Map<string, LiveAppMapGroup>;
  baseUrl: string | null;
  app: LiveAppMapAppMeta | null;
};

type RuntimePage = LiveAppMapPage & {
  resolvedUrl: string | null;
  /** React Flow node id === page.id */
};

type RuntimeEdge = LiveAppMapEdge & {
  id: string; // guaranteed unique
};
```

### 4.3. Store (Zustand — выбран осознанно)

**Почему Zustand, не Jotai:** один document graph + selection + UI flags — classic slice store; меньше boilerplate, проще devtools, хватает для SPA без server state. Jotai имел бы смысл при atomic fine-grained derived UI; здесь bottleneck — iframe, не React re-render atoms.

```ts
type ViewMode = 'map-only' | 'live-iframe';
type IframeScale = 0.5 | 0.75 | 1;

type AppStore = {
  // data
  graph: AppMapGraph | null;
  parseIssues: ParseIssue[];
  assets: AssetStore | null;

  // view
  mode: ViewMode;
  theme: 'dark' | 'light';
  iframeScale: IframeScale;
  searchQuery: string;

  // selection / focus
  selectedPageId: string | null;
  highlightedPageIds: Set<string>; // selected + neighbors

  // iframe manager mirrors (или держать в отдельном store module)
  pinnedPageIds: Set<string>;
  // visibility — см. §5 (часто ref-based, не в React state!)

  // actions
  loadFromFile: (file: File) => Promise<void>;
  loadFromDocument: (doc: LiveAppMapDocument, assets?: AssetStore) => void;
  clearMap: () => void;
  setMode: (mode: ViewMode) => void;
  setTheme: (t: 'dark' | 'light') => void;
  setIframeScale: (s: IframeScale) => void;
  setSearchQuery: (q: string) => void;
  selectPage: (id: string | null) => void;
  togglePin: (id: string) => void;
  setBaseUrl: (url: string) => void;
  openPageInNewTab: (id: string) => void;
};
```

**Важно:** set видимости iframe **не** класть в Zustand на каждый Intersection callback — это вызовет thrash. Visibility держать в `IframeManager` (Map + subscribers / event emitter / `useSyncExternalStore`).

### 4.4. React Flow слой

| Компонент | Ответственность |
|-----------|-----------------|
| `AppMapCanvas` | `<ReactFlow>` host: nodes/edges memo, `onNodeClick`, viewport, dark CSS vars |
| `PageNode` (custom node) | chrome: title, group badge, pin btn, open-external, live/screenshot slot |
| `LiveFrameSlot` | подписка на IframeManager; mount iframe only if `shouldLoad` |
| `MapToolbar` | mode toggle, scale, theme, search, file open |
| `MapMinimap` | `<MiniMap>` xyflow |
| `SearchPalette` | filter pages by title/path/id; on pick → `fitView` + select |
| `DropZone` | drag-and-drop `.appmap`/`.json` |

**Нода (визуал, практично):**

```
┌──────────────────────────────────┐
│ [group] Title              📌 ↗  │  header 36px
│ path / url (truncate)            │  sub 20px
├──────────────────────────────────┤
│                                  │
│   ┌──────────────────────────┐   │  body ~ 240×160 CSS px
│   │  iframe OR screenshot    │   │  (iframe scaled via transform)
│   │  OR frozen placeholder   │   │
│   └──────────────────────────┘   │
│                                  │
└──────────────────────────────────┘
```

- Размер node: ~280×240 (константа `NODE_W` / `NODE_H`) — для ELK/dagre и virtualization math.
- Iframe **внутри** scaled: контейнер `overflow:hidden`; iframe layout size = `NODE_BODY / scale`, CSS `transform: scale(scale)` — так 50%/75%/100% не ломают node geometry.
- Handles: left target, right source (для LR layout).

**Клик по ноде:**

1. `selectPage(id)`.
2. Вычислить neighbors из `adjacency` → `highlightedPageIds = {id} ∪ in ∪ out`.
3. Подсветка: selected stroke primary; neighbors secondary; dim others (`opacity: 0.35` на non-highlight nodes/edges).
4. Опционально `fitView({ nodes: [id], padding, duration })` — **не** auto каждый клик (раздражает); только double-click или кнопка «Focus».

**Zoom / pan / minimap:** из коробки `@xyflow/react` (`Controls`, `MiniMap`, `Background`).

### 4.5. Layout позиций

1. Если у pages есть `position` — использовать.
2. Иначе auto-layout: `@dagrejs/dagre` (проще ELK для MVP) → set `position`.
3. После layout — `fitView` once.
4. User drag nodes → update positions in store (optional persist export later).

### 4.6. UI-режимы и возможности (чеклист продукта)

| Фича | Как |
|------|-----|
| Zoom / pan | React Flow |
| Minimap | `<MiniMap>` |
| Search | store `searchQuery` + command palette / filter list |
| Node click focus + related highlight | §4.4 |
| DnD load `.appmap` / `.json` | DropZone + file input |
| Map-only vs live-iframe | `mode`; map-only never mounts iframes |
| Open in new tab | `window.open(resolvedUrl, '_blank', 'noopener')` |
| Iframe scale 50/75/100% | `iframeScale` + CSS transform |
| Dark theme | `data-theme=dark` + CSS variables; React Flow dark class |
| Pin pages | `pinnedPageIds` + IframeManager keep-alive |
| 50–100+ pages | freeze + optional node virtualization §5 |

---

## 5. Умная заморозка iframe (ключевой раздел)

### 5.1. Проблема

Один iframe ≈ отдельный browsing context: память (десятки MB), main-thread, network, GPU layers.  
100 живых iframe на localhost **убивают** вкладку. Нужен hard budget.

### 5.2. Цели

1. **Viewport-only load:** iframe с реальным `src` только если нода (почти) видна.
2. **Freeze off-screen:** выгрузка — `src = 'about:blank'` **или** unmount iframe.
3. **Re-enter:** снова выставить `resolvedUrl`.
4. **Pin:** pinned ноды **не** выгружаются (пока в бюджете pin).
5. **Budget:** даже pinned+visible ограничены `MAX_LIVE_IFRAMES` (рекомендация **8–12**).
6. Map-only: `MAX = 0`.

### 5.3. Состояния iframe (FSM)

```
                    ┌──────────────────────────────────────┐
                    │                                      │
                    ▼                                      │
              ┌──────────┐   shouldLoad     ┌──────────┐   │
              │  IDLE    │ ───────────────► │ LOADING  │   │
              │(no iframe│                  │ src=url  │   │
              │ or blank)│ ◄── freeze ───── │          │   │
              └──────────┘                  └────┬─────┘   │
                    ▲                            │         │
                    │                     onLoad │         │
                    │                            ▼         │
                    │ freeze              ┌──────────┐     │
                    ├──────────────────── │  LIVE    │     │
                    │                     └────┬─────┘     │
                    │                          │ error     │
                    │                          ▼           │
                    │                     ┌──────────┐     │
                    └──────────────────── │  ERROR   │ ────┘
                         freeze           │ (retry?) │  shouldLoad
                                          └──────────┘
```

| State | DOM | `src` | Память |
|-------|-----|-------|--------|
| `IDLE` | нет iframe **или** iframe с blank | `about:blank` / отсутствует | минимальная |
| `LOADING` | iframe mounted | `resolvedUrl` | растёт |
| `LIVE` | iframe mounted | `resolvedUrl` | высокая |
| `ERROR` | iframe + overlay | last url or blank | средняя |

**Рекомендация реализации unmount vs blank:**

| Подход | Плюсы | Минусы |
|--------|-------|--------|
| **A. Unmount iframe** | Макс. освобождение; проще React | Потеря scroll/form state; reflow |
| **B. `src=about:blank`** | Node shell stable; быстрее reattach | Некоторые browser quirks; state всё равно теряется |
| **C. Hybrid** | blank сразу, unmount через 2–5s debounce | чуть сложнее |

**MVP default: A (unmount)** при freeze.  
**Pin / недавно LIVE:** держать mounted.  
Сохранение состояния iframe cross-origin **невозможно** надёжно (нет доступа к `contentWindow` для чужого origin; даже same-origin sessionStorage страницы переживёт reload, но SPA client state — нет). Документировать: **freeze = cold reload**. Это OK для map visualizer.

### 5.4. Visibility: Intersection Observer

**Где наблюдать:** wrapper `.page-node__body` (не весь React Flow viewport — RF уже клипает).

Нюанс: React Flow использует `transform: translate + scale` на viewport.  
IntersectionObserver относительно **browser viewport** работает корректно с transformed elements в современных браузерах — **использовать root: null** (viewport).

```ts
// Псевдокод IframeVisibilityService
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const id = e.target.getAttribute('data-page-id')!;
      const ratio = e.intersectionRatio;
      // hysteresis: enter > 0.15, leave < 0.02 — меньше thrash на границе
      if (ratio >= 0.15) markVisible(id, true);
      else if (ratio <= 0.02) markVisible(id, false);
    }
    scheduleReconcile(); // rAF coalesce
  },
  { root: null, threshold: [0, 0.02, 0.15, 0.5, 1], rootMargin: '80px' },
);
// rootMargin 80px — prefetch чуть за краем экрана
```

Каждый `PageNode` в `useEffect` регистрирует свой body ref: `manager.observe(id, el)`.

### 5.5. Reconcile algorithm (сердце менеджера)

```ts
const MAX_LIVE = 10;
const MAX_PINNED = 6; // pin тоже в бюджете, но приоритетнее

type Desire = {
  id: string;
  priority: number; // higher = keep
  reason: 'pinned' | 'visible' | 'selected' | 'neighbor-prefetch';
};

function reconcile(state: ManagerState): Set<string> /* ids to load */ {
  const desires: Desire[] = [];

  for (const id of state.allPageIds) {
    let priority = 0;
    let reason: Desire['reason'] = 'visible';

    if (state.pinned.has(id)) {
      priority += 1000;
      reason = 'pinned';
    }
    if (state.selected === id) {
      priority += 500;
      reason = 'selected';
    }
    if (state.visible.has(id)) {
      priority += 100;
      reason = state.pinned.has(id) ? 'pinned' : 'visible';
    }
    // optional: neighbor of selected gets +20 (prefetch) — off by default for memory

    if (priority > 0 && mode === 'live-iframe') {
      desires.push({ id, priority, reason });
    }
  }

  desires.sort((a, b) => b.priority - a.priority);

  const loadSet = new Set<string>();
  for (const d of desires) {
    if (loadSet.size >= MAX_LIVE) break;
    // pin hard-cap: if already MAX_PINNED pins loaded and this is new pin-only offscreen — skip pin? 
    // Simpler: pin counts toward MAX_LIVE; excess pins show badge "pin deferred"
    loadSet.add(d.id);
  }
  return loadSet;
}
```

После reconcile:

```
for id in previouslyLoaded - loadSet:  transition → freeze (IDLE)
for id in loadSet - previouslyLoaded:  transition → LOADING
```

**Coalesce:** `scheduleReconcile` через `requestAnimationFrame` / `queueMicrotask`, не на каждый IO callback отдельно.

### 5.6. Virtualization нод (React Flow + 50–100+)

React Flow **по умолчанию рендерит все nodes** в DOM (с transform culling только partial).  
Для 100 нод **без iframe** ещё терпимо; с iframe — нет (решает freeze).  
Дополнительно:

1. **Only render node chrome always; iframe slot conditional** — must-have (выше).
2. **Optional:** `onlyRenderVisibleElements` prop в React Flow (если доступен в версии xyflow) / custom `nodeTypes` that return lightweight stub when far from viewport (distance from viewport center > N).
3. **Не** использовать полноценный windowing как в списках — RF edges требуют node positions. Positions остаются; DOM body может быть placeholder.

Практичный hybrid:

```
if (!isNearViewport && !pinned && !selected) {
  return <PageNodeShell compact />; // header only, grey box, no observer body
} else {
  return <PageNodeFull />; // observer + possible iframe
}
```

`isNearViewport` считать из `useStore` viewport + node position (math), без IO — дешевле для far nodes. IO — для точного iframe gate.

### 5.7. Pin UX

- Кнопка 📌 на ноде / в search results.
- Pinned badge на chrome; в toolbar: «Pinned: 3/6».
- При превышении бюджета: toast «Слишком много закреплённых; открепите или увеличьте лимит в settings».
- `defaultPinned` из JSON применяется при load.

### 5.8. Потеря состояния и mitigation

| Что теряется при freeze | Mitigation |
|-------------------------|------------|
| SPA client state | Принять; pin важные |
| Scroll position | same-origin postMessage bridge — **future**, не MVP |
| Auth cookies | cookies живут на origin; reload обычно logged-in |
| WebSocket в iframe | разорвутся; pin dashboard-like pages |

### 5.9. Последовательность (step-by-step runtime)

```
User opens map (live mode)
  → layout nodes, fitView
  → PageNodes mount, observe()
  → IO fires for ~visible set
  → reconcile → load top-K by priority
  → LiveFrameSlot mounts <iframe src=url>
  → onLoad → LIVE; show iframe; hide screenshot spinner

User pans away
  → IO ratio < 0.02 (and not pinned)
  → reconcile removes id
  → freeze: unmount iframe OR src=about:blank
  → show last screenshot / «frozen» skeleton

User pans back
  → visible again
  → if budget allows → LOADING → LIVE (cold)

User toggles Map-only
  → mode=map-only → loadSet empty → all freeze
  → screenshots or abstract cards only

User pins node off-screen
  → pinned add → reconcile may load off-screen iframe
  → if over MAX_LIVE → lowest priority visible unloads first
```

### 5.10. Threading / perf tips

- Не читать `getBoundingClientRect` в render.
- `memo(PageNode)` + stable props; `selected`/`highlighted`/`shouldLoad` as booleans.
- Iframe `loading="eager"` только для load set; attribute `pointer-events: none` на iframe пока node не selected (pan не «залипает» в iframe) — **важно для UX**:
  - default: `pointer-events: none` on iframe;
  - when node selected or «interact» toggle: `pointer-events: auto`.
- `sandbox` attribute: `allow-scripts allow-same-origin allow-forms allow-popups` — сужать по политике; документировать security.
- Debounce scale changes (не remount iframe при смене 50→75 — только CSS).

### 5.11. Тестируемость менеджера

Вынести pure `reconcile()` + FSM transitions в `iframe-manager/policy.ts` — unit tests без DOM.  
IO — thin adapter.  
Это позволит доказать budget logic без браузера.

---

## 6. Структура папок

**Фактически в monorepo** (актуально):

```
all-screens-viewer/
├── apps/visualizer-spa/            # SPA :4310 (Vite + React 19)
│   ├── public/examples/demo-shop.liveappmap.json
│   ├── public/maps/korbor-*.liveappmap.json
│   └── src/
│       ├── App.tsx, main.tsx
│       ├── components/             # MapToolbar, StateInjectPanel, …
│       ├── flow/                   # AppMapCanvas, PageNode, layout
│       ├── store/                  # Zustand
│       └── styles/
├── packages/                       # schema, graph, iframe-policy, scanners, cli, …
├── maps/                           # korbor-*.json / *.liveappmap.json
├── docs/
│   ├── live-app-map-design.md      # этот документ (viewer seed)
│   └── live-app-map-enterprise-tdd.md
├── package.json                    # bun workspaces
└── README.md
```

Ниже — **исходный seed-layout** одиночного SPA (исторический reference; domain/parsers/iframe-policy вынесены в `packages/*`):

```
apps/visualizer-spa/   # (раньше — корень all-screens-viewer/)
├── public/examples/demo-shop.liveappmap.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/
│   ├── domain/          → сейчас packages/schema + packages/graph
│   ├── parsers/         → packages/schema, packages/export-appmap
│   ├── store/
│   ├── iframe-manager/  → packages/iframe-policy (+ SPA adapter)
│   ├── flow/
│   └── components/
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

---

## 7. Основные библиотеки

| Библиотека | Назначение | Примечание |
|------------|------------|------------|
| `react` / `react-dom` **19.x** | UI | version gate Actions/hooks по нужде; map app mostly client state |
| `typescript` | типы | strict |
| `vite` | bundler / dev server | |
| `@xyflow/react` | React Flow canvas | nodes, edges, minimap, controls |
| `zustand` | client store | slices optional |
| `zod` | runtime validate JSON | shared with types via `z.infer` |
| `jszip` | unpack `.appmap` | browser-side |
| `@dagrejs/dagre` | auto-layout | MVP; later ELK optional |
| (optional) `cmdk` / custom | search palette | |
| (optional) `sonner` | toasts parse errors | |
| (dev) `vitest` | unit: parsers + reconcile policy | |
| (dev) `@testing-library/react` | component tests | |

**Не тащить в MVP:** Redux, React Query (нет server API), Framer Motion (лишнее), full component library (если не нужна).

---

## 8. Сложности и решения

| # | Сложность | Риск | Решение |
|---|-----------|------|---------|
| 1 | **`X-Frame-Options: DENY` / CSP `frame-ancestors`** | Iframe пустой/ошибка для внешних сайтов | Detect `onError` / timeout; fallback screenshot; flag `iframeDisabled`; document that fixing remote headers is out of scope; future optional local proxy stage |
| 2 | **Same-site cookies / auth walls** | localhost app требует login | User pins login + target; or map-only + screenshots; note in UI |
| 3 | **Memory 50–100 pages** | Tab crash | MAX_LIVE 8–12, freeze unmount, pin cap, map-only mode |
| 4 | **Layout thrash / IO thrash** | Jank on pan | hysteresis thresholds, rAF reconcile, memo nodes, pointer-events none |
| 5 | **React Flow + transformed IO** | False visible/hidden | root=null, rootMargin prefetch, test on zoom extremes |
| 6 | **Parametric paths** `/users/:id` | Bad live URL | fillParams demo values; allow per-page url override in future editor |
| 7 | **Appmap is mobile-oriented** | No real web URL | mandatory Base URL after import; screenshots as primary until base set |
| 8 | **Iframe steals pointer events** | Can't pan map | pointer-events none until selected / «Interact» mode |
| 9 | **Cross-origin state save** | Can't snapshot DOM | Accept cold reload; pin |
| 10 | **Blob URL leaks** | RAM after re-import | AssetStore.revokeAll on clear/load |
| 11 | **Duplicate edge ids** | RF warnings | synthesize unique edge ids |
| 12 | **Dark theme + iframe** | Iframe content has own theme | Not controllable cross-origin; only chrome dark |
| 13 | **Security (sandbox / XSS via map file)** | Malicious url in JSON | sandbox attrs; block `javascript:` URLs in resolve; warn on non-http(s) |

### Future optional stage (не MVP)

- Local dev proxy, снимающий frame-blocking headers **только** для allowlisted localhost targets (user opt-in, security warning).
- Export current layout back to `liveappmap` JSON.
- ELK layout, flow playback из appmap `flows/`.
- Persist pins/mode in `localStorage`.

---

## 9. Этапы реализации

Статус относительно monorepo + `apps/visualizer-spa` (порт **4310**):

| Phase | Содержание | Статус |
|-------|------------|--------|
| **0** Scaffold | Vite + React 19 + TS; React Flow shell | **Implemented** |
| **1** MVP map | JSON parse, Zustand, dagre, `PageNode`, search/select, demo JSON | **Implemented** |
| **2** Appmap import | zip pipeline / screenshots / baseUrl | **Partial** (export bridge в packages; UI-import — по мере polish) |
| **3** Live iframe + freeze | policy reconcile, pin, live mode, tests | **Implemented** (core policy в `@live-app-map/iframe-policy`) |
| **4** Polish | empty/error, Korbor presets, state inject roles | **Partial** |
| **5** Backlog | proxy headers, ELK, session restore, e2e polish | **Backlog** |

### Phase 0 — Scaffold

- Vite + React 19 + TS strict.
- CSS themes dark default.
- Empty shell + React Flow hello world.

### Phase 1 — MVP map (no live iframe yet)

- Domain types + zod + `parseLiveAppMapJson`.
- Zustand store + load JSON via file input / DnD.
- Dagre layout → React Flow custom `PageNode` (title, path, screenshot placeholder).
- Edges, minimap, zoom/pan, dark theme.
- Search by title/id/path.
- Select + neighbor highlight.
- Example `demo-shop.liveappmap.json`.

**Критерий MVP-1:** открыть JSON → увидеть граф → искать → кликать с подсветкой.

### Phase 2 — Appmap import

- JSZip pipeline + field mapping table (§3).
- AssetStore screenshots in nodes.
- Base URL dialog after import.
- ParseIssue UI.

**Критерий:** открыть sample `.appmap` → nodes with screenshots + edges.

### Phase 3 — Live iframe + freeze (главный milestone)

- `ViewMode` map-only | live-iframe.
- `IframeManager` + IO + pure `reconcile` + MAX_LIVE.
- `LiveFrameSlot` FSM.
- Pin / unpin.
- Iframe scale 50/75/100 (CSS).
- pointer-events policy.
- Open in new tab.
- Unit tests: `policy.ts`, parsers.

**Критерий:** 50+ nodes, live mode, pan around — одновременно LIVE iframes ≤ MAX_LIVE; pin keeps chosen page hot; map-only zero iframes.

### Phase 4 — Polish

- Status bar: live count, pinned, warnings.
- Empty / error / loading states.
- Keyboard: `/` search, `Esc` clear selection.
- Performance pass (memo, near-viewport stubs).
- README: format + how to run against local app.
- Korbor dogfood presets + role state inject (`lam_role`).

### Phase 5 — Improvements (backlog)

- Proxy opt-in for frame headers.
- Export JSON with positions.
- ELK; groups as parent nodes (RF sub-flows).
- session restore; compare two maps.
- Playwright smoke (load example, assert node count) — e2e scaffold уже в `apps/visualizer-spa/e2e/`.

---

## 10. Критерии готовности продукта

Ориентир приёмки visualizer; **ядро SPA + packages уже в monorepo** (статус шапки: Implemented / partial). Проверка:

```bash
bun install
bun test packages apps/visualizer-spa
bun run typecheck
bun run dev:visualizer   # http://localhost:4310
```

1. JSON + appmap ingest green path.
2. Live iframes only for reconciled load set.
3. Freeze off-screen verified (DOM: no extra iframe elements beyond budget).
4. Pin works.
5. Map-only kills all iframes.
6. 100-node fixture usable on mid laptop (no tab crash on pan).
7. Dark theme usable.
8. Types strict; parsers unit-tested.

Часть пунктов (1–5, 7–8) закрыта в packages/SPA; 6 и polish appmap — residual / Phase 4–5.

---

## 11. Краткое резюме решений

| Вопрос | Решение |
|--------|---------|
| Native format | `liveappmap` v1: `version`, `pages[]`, `edges[]`, optional groups/states/layout/extensions |
| Appmap | zip → `manifest.json` + `map.json` + screens; map fields per §3.3; flows out of core |
| Store | Zustand |
| Flow lib | `@xyflow/react` |
| Freeze | IntersectionObserver + priority reconcile + unmount; pin; MAX_LIVE≈10 |
| Scale | CSS transform inside fixed node geometry |
| Interact | pointer-events none until select |
| Frame blocked sites | fallback + document risk; no mandatory proxy in MVP |
| Где код | monorepo: `apps/visualizer-spa` (:4310) + `packages/*` |

---

*Конец design document. Реализация SPA — **не** non-goal: код в monorepo (`apps/visualizer-spa`, порт 4310). Документ остаётся seed по формату и политике freeze; product-канон — [`live-app-map-enterprise-tdd.md`](./live-app-map-enterprise-tdd.md).*
