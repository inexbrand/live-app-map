# Live App Map — Enterprise Technical Design Document

| | |
|---|---|
| **Версия** | 1.0 |
| **Статус** | Design only (код не пишем) |
| **Аудитория** | maintainers, contributors, technical stakeholders |
| **Горизонт** | 3–5 лет поддержки продукта |
| **Связь** | Предыдущий viewer-ориентированный draft: `docs/live-app-map-design.md` (формат JSON / freeze seed). Этот документ — **канон продукта**. |

---

## 1. Product Vision & Goals

### 1.1. Vision

**Live App Map** — professional developer tool и library, которая:

1. **Автоматически** сканирует кодовую базу (Next.js first-class, React Router — second wave).
2. Строит **точный, версионируемый граф** страниц, layout-иерархии и навигационных связей.
3. Показывает его как **интерактивную карту** с **живыми iframe** реальных страниц dev-сервера.
4. Встраивается с **нулевой/минимальной конфигурацией** (как React Query Devtools / Storybook addon), либо работает standalone / CLI.

Ценность одной фразой:

> Поставил пакет → открыл overlay → видишь и трогаешь **всю** карту приложения, а не держишь её в голове.

### 1.2. Product shape (два режима доставки)

| Режим | Что это | Аналог |
|-------|---------|--------|
| **Library / embed** | npm-пакеты: React component, Next plugin, floating Devtools | `@tanstack/react-query-devtools` |
| **Standalone** | CLI + local server + optional desktop-less browser tab | Storybook dev, `next-devtools` panel |

Оба режима делят **один graph model, один scanner, один visualizer core**.

### 1.3. Goals (product)

| ID | Goal | Non-goal |
|----|------|----------|
| G1 | Accurate route inventory for App Router + Pages Router | Perfect runtime-only dynamic route discovery without code |
| G2 | Static navigation edges with confidence + diagnostics | Full program analysis / symbolic execution of all JS |
| G3 | Live iframe map that stays usable at **150–300+** routes | Pixel-perfect multiplayer collab editor |
| G4 | Monorepo-native (Turborepo/Nx apps/* packages) | Hosting SaaS cloud product in v1 architecture (optional later) |
| G5 | Stable public API + versioned map format for 3–5y | Weekly breaking changes |
| G6 | Plugin surface for scanners, edge extractors, UI panels | Unrestricted eval of untrusted plugins in-process without isolation notes |

### 1.4. Design principles (maintain for 3–5 years)

1. **Scan ≠ View.** Scanner produces immutable `AppMapDocument`; Visualizer never walks `fs`.
2. **Deterministic graph.** Same sources + config → same node ids (stable hashing). Enables diff.
3. **Best-effort edges, hard-accurate nodes.** Missing a `router.push` is a warning; missing a `page.tsx` is a bug.
4. **Dev-time by default.** Production bundle tree-shakes embed to zero unless explicitly opted-in.
5. **Budget-first iframes.** Live UX never outranks tab stability.
6. **Diagnostics over silence.** Every drop/skip is a structured diagnostic code.
7. **Extension via plugins, not forks.**

---

## 2. Target Users & Use Cases

### 2.1. Personas

| Persona | Need |
|---------|------|
| **App engineer** | «Где все экраны и как сюда попадают?» onboarding + navigation audit |
| **Tech lead / architect** | Review structure, dead routes, layout depth, coupling |
| **Design engineer** | Click through real UI states without hand-maintaining sitemap |
| **Platform / DX team** | Standard tool in monorepo template; CI graph export + drift check |
| **QA** | Coverage of routes; open live pages; export map for test plan |

### 2.2. Primary use cases

1. **Zero-config explore:** install → floating button → full map of local Next app.
2. **Navigate & interact:** select node → live iframe → click real UI; pin auth + dashboard.
3. **Search & focus:** find `/settings/billing` → highlight in/out edges → open in new tab.
4. **Layout hierarchy:** group by route group / layout segment; filter parallel slots.
5. **Dynamic routes:** config example params → live `/users/demo-user` works.
6. **Monorepo multi-app:** pick app workspace; scan only that Next root.
7. **Export:** write `appmap.live.json` or `.appmap` for docs / CI artifact.
8. **Diff:** compare `main` graph vs branch graph → added/removed/changed routes & edges.
9. **CI guard:** fail PR if new page without required segment config / or graph size regression policy (plugin).
10. **Embed in internal portal:** `<LiveAppMap graph={doc} mode="map-only" />` read-only.

### 2.3. Explicit non-use-cases (v1–v2 product boundary)

- Production end-user site map for SEO (not the job).
- Replacing Storybook component catalog.
- Mobile native (RN) cartography (interop with `.appmap` import only).
- Auto-fixing / crawling the running site as primary discovery (optional enhancer later).

---

## 3. High-level Architecture

### 3.1. Pipeline

```
  Source tree (Next/React)
           │
           ▼
  ┌─────────────────┐
  │  Scanner Host   │  CLI / Next plugin / Vite plugin / watch worker
  │  + Plugins      │
  └────────┬────────┘
           │ AppMapDocument (versioned JSON graph)
           ▼
  ┌─────────────────┐
  │  Graph Runtime  │  normalize, index, adjacency, diff, query
  └────────┬────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
 Visualizer   Integrations
 (React Flow  (Devtools overlay,
  + Iframe     route /api, CLI UI,
  Manager)     export, CI)
```

### 3.2. Process topology (dev)

```
┌──────────────────────┐     HTTP/WS      ┌──────────────────────────┐
│ Next.js dev server   │◄────────────────►│ Live App Map sidecar     │
│ (user app, :3000)    │  graph push      │ (optional :4310)         │
│ + embed Devtools UI  │  or file poll    │ scanner watch + static UI│
└──────────────────────┘                  └──────────────────────────┘
         │
         │ iframe src=http://localhost:3000/<path>
         ▼
   Visualizer nodes (budgeted)
```

**Решение:** dual delivery:

| Path | When | How graph gets to UI |
|------|------|----------------------|
| **A. In-process embed** | `<LiveAppMapDevtools />` in root layout | Scanner runs in Node via Next instrumentation / separate worker; graph served at virtual module or `/__live-app-map/graph.json` |
| **B. Sidecar CLI** | `live-app-map dev` | Watches fs, serves visualizer SPA, iframes point at `--target-url` |
| **C. Static export** | CI / docs | `live-app-map scan -o map.json` → visualizer `map-only` |

**Why not only in-browser scan?** Browser cannot reliably read whole monorepo `fs`; Next App Router conventions live on disk. Scanner is **Node-first**.

### 3.3. Layer rules (hard)

| Layer | May depend on | Must not |
|-------|---------------|----------|
| `schema` / `graph` | nothing product-specific | React, Next, DOM |
| `scanner-*` | `schema`, `fs`, TS tooling | React Flow, iframe |
| `iframe-policy` | pure types | DOM optional adapter |
| `visualizer` | `graph`, `iframe-policy`, React | `fs`, Next compiler |
| `next` / `react-router` integrations | scanners + visualizer | reimplement graph format |
| `cli` | all | ship React into scanner hot path unnecessarily |

### 3.4. Technology choices (locked unless proven otherwise)

| Concern | Choice | Why |
|---------|--------|-----|
| Language | TypeScript strict | DX + enterprise consumers |
| Monorepo | pnpm workspaces + Turborepo | standard DX monorepo; cache tasks |
| Scanner AST | **ts-morph** primary; fallback **@babel/parser** for non-TS | Project-aware types optional; tsconfig paths |
| Watch | chokidar + incremental graph patch | HMR-like map updates |
| UI graph | **@xyflow/react** | ecosystem, custom nodes; revisit only if 300+ nodes chrome itself fails (measure first) |
| Client state | Zustand in visualizer | simple, embeddable |
| Validation | Zod (or Valibot) on document boundaries | versioned runtime checks |
| Zip .appmap | jszip | browser + node |
| Build (packages) | tsup / unbuild | dual ESM+CJS where needed for Next |
| Test | Vitest + fixture apps | scanners need real trees |
| Docs | Fumadocs or Nextra | long-term doc site |

**Not chosen:** full webpack plugin that rewrites user app as primary; too invasive. Prefer explicit integration + optional Next config plugin for route injection only.

---

## 4. Package Structure (monorepo)

```
live-app-map/                          # product monorepo root
├── packages/
│   ├── schema/                        # @live-app-map/schema
│   │   # Zod + TS types, formatVersion, JSON Schema export
│   ├── graph/                         # @live-app-map/graph
│   │   # AppMapDocument normalize, index, adjacency, query, diff
│   ├── diagnostics/                   # @live-app-map/diagnostics
│   │   # Diagnostic codes, severity, formatters (CLI/UI)
│   ├── scanner-core/                  # @live-app-map/scanner-core
│   │   # walk, ignore, cache, plugin host, incremental API
│   ├── scanner-next/                  # @live-app-map/scanner-next
│   │   # App Router + Pages Router route discovery + edge extractors
│   ├── scanner-react-router/          # @live-app-map/scanner-react-router  (wave 2)
│   ├── iframe-policy/                 # @live-app-map/iframe-policy
│   │   # pure reconcile, budgets, FSM types — no React
│   ├── visualizer/                    # @live-app-map/visualizer
│   │   # React Flow canvas, nodes, toolbar, themes
│   ├── react/                         # @live-app-map/react
│   │   # <LiveAppMap />, <LiveAppMapDevtools />, hooks
│   ├── next/                          # @live-app-map/next
│   │   # withLiveAppMap(), instrumentation hooks, route handlers
│   ├── plugin-api/                    # @live-app-map/plugin-api
│   │   # ScannerPlugin, EdgePlugin, UIPlugin contracts
│   ├── export-appmap/                 # @live-app-map/export-appmap
│   │   # liveappmap ↔ .appmap zip bridge
│   └── cli/                           # @live-app-map/cli
│       # live-app-map scan | dev | diff | export
├── apps/
│   ├── docs/                          # documentation site
│   ├── playground/                    # fixture Next app (150+ routes synthetic)
│   └── visualizer-spa/                # standalone UI served by CLI
├── fixtures/
│   ├── next-app-router-basic/
│   ├── next-app-router-complex/       # groups, parallel, intercept, catch-all
│   ├── next-pages-router/
│   └── monorepo-turbo-two-apps/
├── .changeset/                        # versioning
└── turbo.json
```

### 4.1. Public npm surface (semver)

| Package | Stability | Consumer |
|---------|-----------|----------|
| `@live-app-map/next` | **primary** | Next apps |
| `@live-app-map/react` | stable | embed / custom shells |
| `@live-app-map/cli` | stable | DX / CI |
| `@live-app-map/schema` | stable | plugins, CI |
| `@live-app-map/graph` | stable | advanced |
| `@live-app-map/plugin-api` | stable | extension authors |
| `@live-app-map/visualizer` | mostly internal, public for headless embed | design systems |
| `scanner-*`, `iframe-policy` | public but “advanced” | tool builders |

**Single meta package (optional):** `live-app-map` re-exports recommended entry for docs simplicity — implementation stays split.

### 4.2. Versioning policy

- **Format version** (`formatVersion: 1`) independent of package semver.
- Changesets: patch scanners fixes; minor new edge kinds / plugins; major public API breaks.
- Migration guides required for any major of `@live-app-map/next` or format major.

---

## 5. Detailed Scanning Strategy

### 5.1. Scanner Host responsibilities (`scanner-core`)

```ts
type ScanRequest = {
  projectRoot: string;
  appRoot?: string;              // e.g. apps/web
  framework: 'next' | 'react-router' | 'auto';
  tsconfigPath?: string;
  include?: string[];
  exclude?: string[];            // defaults: node_modules, .next, dist, coverage
  exampleParams?: ExampleParamsConfig;
  plugins?: LiveAppMapPlugin[];
  mode: 'full' | 'incremental';
  previous?: AppMapDocument;     // for incremental
  watch?: boolean;
};

type ScanResult = {
  document: AppMapDocument;
  diagnostics: Diagnostic[];
  timing: { discoverMs: number; edgesMs: number; totalMs: number };
  fileHashes: Record<string, string>; // for incremental
};
```

**Pipeline stages:**

1. **Resolve workspace** — detect Next root (`next.config.*`, `app/`, `pages/`), monorepo package.
2. **Discover route nodes** — framework plugin.
3. **Discover layout/special nodes** — layout, loading, error, template, default, route handlers (optional tier).
4. **Extract edges** — static analysis passes + plugins.
5. **Materialize URLs** — apply `exampleParams` + `baseUrl`.
6. **Validate & index** — schema + dangling refs.
7. **Emit diagnostics** — sorted, stable codes.

### 5.2. Next.js App Router — route discovery

**Root candidates:** `app/`, `src/app/` (exactly one primary; if both, diagnostic `AMBIGUOUS_APP_DIR` and prefer `src/app` if `src/` used elsewhere).

#### 5.2.1. File conventions → node kinds

| File | Kind | Creates route segment? |
|------|------|------------------------|
| `page.js/ts/jsx/tsx/mdx` | `page` | yes — leaf route |
| `layout.*` | `layout` | segment chrome (not separately iframe by default) |
| `template.*` | `template` | metadata only / optional node |
| `loading.*` | `loading` | attach to segment |
| `error.*` / `global-error.*` | `error` | attach |
| `not-found.*` | `not-found` | special route node optional |
| `default.*` | `parallel-default` | parallel slot default |
| `route.*` | `route-handler` | **API** tier (default: include as non-iframe nodes, filterable) |
| `opengraph-image.*`, `icon.*`, … | metadata assets | ignore or metadata |

#### 5.2.2. Folder segment grammar

Implement a **deterministic segment parser** (hand-written state machine, not regex soup):

| Folder name | Meaning | URL contribution |
|-------------|---------|------------------|
| `about` | static | `/about` |
| `[id]` | dynamic | `/:id` → example fill |
| `[...slug]` | catch-all | `/*slug` |
| `[[...slug]]` | optional catch-all | optional |
| `(marketing)` | **route group** | no URL; group id for visual grouping |
| `@modal` | **parallel route** slot | no URL path; slot metadata |
| `(.)photo` | intercepting same level | intercept edge + virtual overlay route |
| `(..)photo` | intercept parent | same |
| `(..)(..)photo` | intercept up 2 | same |
| `(...)photo` | intercept from root | same |

**Route id scheme (stable):**

```
route:<posix-path-from-app-root-without-groups>
# examples:
route:/
route:/users/[id]
route:/shop/[...slug]
# layouts:
layout:/
layout:/dashboard
# parallel:
slot:/dashboard@analytics
# intercept:
intercept:/(.)photo@modal→/photo/[id]   # documented algorithm
```

**Why path-based ids:** rename of `(group)` must not change id; rename of `[id]`→`[userId]` **does** change id (real route change). Diff benefits.

#### 5.2.3. Parallel routes

- Discover `@slot` directories under a segment.
- Children under `@slot` become pages with `parallelSlot: "slot"` and `parentSegment`.
- Soft-nav / intercept combinations: create **edges** `kind: "parallel"` and `kind: "intercept"` rather than inventing fake URL paths when URL is shared with children of default slot.
- Live iframe URL = resolved URL of the **composed** page the user would open (default slot page), with note that parallel UI depends on soft navigation — diagnostic `PARALLEL_LIVE_LIMITATION` when accurate composition needs client state.

#### 5.2.4. Intercepting routes

- Parse intercept prefix from folder name.
- Create node for intercepting `page` with `presentation: "intercept"`.
- Edge: `from: intercepted-target`, `to: intercept-page`, `kind: "intercept"`, plus reverse `opens`.
- Live URL: hard-load shows **full page** variant (Next behavior), not intercept modal — document honestly; soft-nav simulation is plugin/future.

#### 5.2.5. Route groups

- Strip `(name)` from URL path.
- Keep `groups: ["marketing", …]` on node for filters and layout coloring.
- Nested groups accumulate list.

#### 5.2.6. Layout hierarchy edges

For each `layout` at segment S and page/layout under S:

```
edge { from: layout:S, to: child, kind: "wraps" }
```

Visualizer can **cluster** by layout depth without mixing into navigation edges (separate edge layer toggles: Navigation | Structure).

### 5.3. Next.js Pages Router

**Roots:** `pages/`, `src/pages/`.

| Pattern | Handling |
|---------|----------|
| `index.tsx` | `/` or segment index |
| `about.tsx` | `/about` |
| `users/[id].tsx` | dynamic |
| `users/[...slug].tsx` | catch-all |
| `users/[[...slug]].tsx` | optional catch-all |
| `_app`, `_document`, `_error` | special non-page |
| `api/*` | route-handler tier |
| ignore `*.test.*`, `__mocks__` | exclude |

If **both** `app/` and `pages/` exist (migration): scan both; prefix node source `router: "app" | "pages"`; diagnostic `HYBRID_ROUTER`.

### 5.4. Navigation edge extraction (static analysis)

#### 5.4.1. Supported patterns (Next, priority order)

| Pattern | Confidence | Notes |
|---------|------------|-------|
| `<Link href="/x">` / `href={{ pathname }}` from `next/link` | high | static string / template |
| `href={\`/users/${id}\`}` | medium | path template → dynamic target `/users/[id]` if matchable |
| `router.push('/x')` / `replace` from `next/navigation` or `next/router` | high if literal | |
| `redirect('/x')` / `permanentRedirect` from `next/navigation` | high | server |
| `NextResponse.redirect` | medium | route handlers / middleware |
| `middleware.ts` matchers + redirects | medium | separate pass |
| `headers()` based redirects | low | diagnostic only |
| dynamic `href={variable}` | low | emit `DYNAMIC_HREF` edge stub optional off by default |

#### 5.4.2. Implementation approach

1. Build **module graph subset**: all files under `app/`, `pages/`, plus imported local modules up to depth N (default 3) from page/layout files; exclude `node_modules`.
2. Parse with **ts-morph** project (reuse tsconfig paths).
3. Pass **EdgeExtractor** visitors:
   - JSX `Link` components (resolve name via import: `next/link`).
   - Call expressions: `push`, `replace`, `redirect`, `permanentRedirect`.
4. Resolve href:
   - Literal → normalize path (strip `basePath`, query/hash optional separate).
   - Template → convert to pattern; match against known routes (dynamic segment unification).
   - Object `pathname` + `query` → pathname only for node match.
5. Create edge:
   ```ts
   {
     id: stableHash(fromRouteId, toRouteId, kind, raw),
     from: fromRouteId,  // owning page/layout module’s route
     to: toRouteId | null,
     kind: 'link' | 'push' | 'replace' | 'redirect' | 'middleware',
     confidence: 'high' | 'medium' | 'low',
     raw: "router.push('/cart')",
     source: { file, line, column },
   }
   ```
6. Unresolved `to` → diagnostic `UNRESOLVED_TARGET` + optional dangling edge display toggle.

**Performance guard:** cap AST files per scan (e.g. 5000); beyond that, page-local only + diagnostic `EDGE_SCAN_TRUNCATED`.

#### 5.4.3. What we deliberately skip (initially)

- Runtime CMS-driven menus without static paths.
- String-concat navigation not matching route table.
- Third-party router wrappers unless plugin maps them.

Plugins can add extractors for `react-router` `<Link to>`, `Navigate`, etc.

### 5.5. Example params for dynamic routes

```ts
// live-app-map.config.ts
import { defineConfig } from '@live-app-map/cli';

export default defineConfig({
  baseUrl: 'http://localhost:3000',
  exampleParams: {
    // by param name
    id: 'demo',
    userId: 'user_1',
    slug: ['a', 'b'],          // catch-all
    // by route pattern override
    byRoute: {
      '/shop/[...slug]': { slug: ['shoes', 'nike'] },
      '/blog/[locale]/[slug]': { locale: 'en', slug: 'hello' },
    },
  },
  // optional generate function
  // resolveExample: (route) => Record<string, string | string[]>
});
```

Materialized live URL algorithm:

```
pattern /users/[id]/orders/[orderId]
+ params { id: 'demo', orderId: '42' }
→ /users/demo/orders/42
```

Missing param → use `"example"` + diagnostic `MISSING_EXAMPLE_PARAM` (page still listed; iframe may 404 — show capture status).

### 5.6. Monorepo support (Turborepo / Nx)

1. **Detection:** `pnpm-workspace.yaml` / `nx.json` / `turbo.json`.
2. **App selection:**
   - CLI: `--filter=web` / `--dir=apps/web`
   - Config: `apps: [{ name, root, framework }]`
   - Auto: packages that depend on `next` and contain `app` or `pages`
3. **Scan root** = package root, not monorepo root (avoid scanning all apps into one graph unless `mode: 'workspace-multi'`).
4. **Multi-app workspace graph (enterprise):** optional composite document with `apps[]` and namespaced node ids `app:web/route:/`.

### 5.7. Watch / incremental

- Hash file contents of discovered route files + edge-scanned modules.
- On change: re-discover affected subtree; re-extract edges for changed modules; patch document; bump `document.revision`.
- Push to UI via WebSocket (`graph:update`) or event on embed bridge.
- Debounce 100–200ms.

### 5.8. React Router (wave 2 summary)

- Discover `createBrowserRouter` routes objects / `Route` trees in known entry files (config-assisted).
- Lower accuracy without convention — **require** `live-app-map.config.ts` `entries[]` or Vite plugin.
- Same graph model; `framework: "react-router"`.

---

## 6. Graph Data Model

### 6.1. Document (canonical)

```ts
/** Serialized interchange + runtime */
interface AppMapDocument {
  formatVersion: 1;
  kind: 'live-app-map';
  generatedAt: string;           // ISO
  generator: { name: string; version: string };
  revision: string;              // content hash
  project: {
    name?: string;
    root: string;                // relative or absolute sanitized
    framework: 'next' | 'react-router' | 'hybrid' | 'unknown';
    next?: { router: 'app' | 'pages' | 'hybrid'; basePath?: string; monorepo?: boolean };
  };
  baseUrl: string | null;
  nodes: AppMapNode[];
  edges: AppMapEdge[];
  groups?: AppMapGroup[];
  diagnostics?: Diagnostic[];    // optional embed; often side channel
  layout?: LayoutHints;
  extensions?: Record<string, unknown>;
}
```

### 6.2. Node

```ts
type NodeKind =
  | 'page'
  | 'layout'
  | 'route-handler'
  | 'intercept'
  | 'not-found'
  | 'external'
  | 'unknown';

interface AppMapNode {
  id: string;                    // stable route:… / layout:…
  kind: NodeKind;
  title: string;                 // human: "Users / [id]" or export name
  pathPattern: string;           // /users/[id]
  pathExample?: string;          // /users/demo
  url?: string;                  // absolute live URL if baseUrl set
  source?: { file: string; exportName?: string };
  groupIds?: string[];           // route groups + custom
  tags?: string[];               // parallel slot name, etc.
  dynamicParams?: string[];
  parallelSlot?: string | null;
  intercept?: { type: string; targetPathPattern?: string } | null;
  presentation?: 'page' | 'modal' | 'intercept' | 'slot';
  iframePolicy?: {
    enabled: boolean;            // false for route-handler, external blocked
    reason?: string;
  };
  metadata?: Record<string, unknown>;
  /** Optional persisted canvas position */
  position?: { x: number; y: number };
}
```

### 6.3. Edge

```ts
type EdgeKind =
  | 'link' | 'push' | 'replace' | 'redirect' | 'middleware'
  | 'wraps'          // layout hierarchy
  | 'parallel'
  | 'intercept'
  | 'parent'         // optional segment tree
  | 'unknown';

interface AppMapEdge {
  id: string;
  from: string;
  to: string | null;
  kind: EdgeKind;
  confidence: 'high' | 'medium' | 'low';
  label?: string;
  raw?: string;
  source?: { file: string; line: number; column: number };
  metadata?: Record<string, unknown>;
}
```

### 6.4. Layers in the UI (not separate files)

Edges filterable by layer:

- **Navigation** — link/push/replace/redirect/middleware  
- **Structure** — wraps/parent  
- **Composition** — parallel/intercept  

Default view: Navigation + Structure (wraps as group boundaries).

### 6.5. Compatibility with prior `liveappmap` viewer format

Provide bi-directional adapter:

| Enterprise `AppMapDocument` | Viewer `pages`/`edges` |
|-----------------------------|-------------------------|
| page nodes | `pages[]` |
| pathExample/url | path/url |
| navigation edges only by default | edges |
| layouts | optional pages with type layout or groups |

Export `.appmap` (expo-map zip) maps screenshots if present; live URLs in extensions — best-effort.

### 6.6. Diff model

```ts
interface AppMapDiff {
  formatVersion: 1;
  leftRevision: string;
  rightRevision: string;
  nodes: { added: string[]; removed: string[]; changed: Array<{ id: string; fields: string[] }> };
  edges: { added: string[]; removed: string[] };
}
```

CLI: `live-app-map diff old.json new.json --exit-code` for CI.

---

## 7. Live Iframe System + Freeze / Virtualization Policy

This subsystem is a **hard reliability boundary**. Implement as pure policy package + thin DOM adapter.

### 7.1. Goals

| Goal | Target |
|------|--------|
| Live only when useful | visible ∪ pinned ∪ (optional selected neighbors off by default) |
| Hard cap | `maxLiveIframes` default **8** (configurable 1–16) |
| Scale | 300 nodes: chrome OK; live ≤ cap |
| Modes | `live` \| `map-only` \| `compact` |
| Predictable unload | freeze = cold reload (documented) |

### 7.2. View modes

| Mode | Iframes | Node chrome |
|------|---------|-------------|
| **live** | policy-driven | full preview area |
| **map-only** | never | screenshot/placeholder/abstract |
| **compact** | never | small nodes (title+path), denser layout |

### 7.3. FSM per page slot

```
IDLE ──shouldLoad──► LOADING ──onLoad──► LIVE
  ▲                    │                  │
  │                    onError            │
  │                    ▼                  │
  ◄──── freeze ──── ERROR ◄── freeze ─────┘
```

| State | DOM | Memory |
|-------|-----|--------|
| IDLE | no iframe **or** blank after grace | low |
| LOADING | iframe `src=url` | rising |
| LIVE | iframe active | high |
| ERROR | overlay + optional blank | low/med |

**Default freeze action:** unmount iframe (max reclaim).  
**Alternative:** `src=about:blank` immediately, unmount after 3s idle (hybrid) — config `freezeStrategy: 'unmount' | 'blank' | 'hybrid'`.

### 7.4. Visibility

- `IntersectionObserver` on node body, `root: null`, `rootMargin: 80px`.
- Hysteresis: enter ≥ 0.15, leave ≤ 0.02 (prevent thrash at edges).
- Coalesce updates: `requestAnimationFrame` → single `reconcile()`.

**React Flow transform note:** IO against browser viewport is correct for transformed nodes in modern Chromium/Firefox/Safari; add integration tests at zoom 0.3 and 1.5.

### 7.5. Pure reconcile (core algorithm)

```ts
type PriorityReason = 'pinned' | 'selected' | 'visible' | 'prefetch';

function priority(id: string, s: PolicyState): number {
  let p = 0;
  if (s.pinned.has(id)) p += 1000;
  if (s.selected === id) p += 500;
  if (s.visible.has(id)) p += 100;
  if (s.prefetch.has(id)) p += 20; // default off
  // recency bias: recently LIVE gets +5 to reduce churn
  p += Math.min(5, s.recentLiveScore[id] ?? 0);
  return p;
}

function reconcile(s: PolicyState): Set<string> {
  if (s.mode !== 'live') return new Set();
  const ranked = s.candidates
    .map((id) => ({ id, p: priority(id, s) }))
    .filter((x) => x.p > 0 && s.iframeAllowed[id])
    .sort((a, b) => b.p - a.p || a.id.localeCompare(b.id)); // stable tie-break
  const live = new Set<string>();
  for (const x of ranked) {
    if (live.size >= s.maxLiveIframes) break;
    live.add(x.id);
  }
  return live;
}
```

**Pin rules:**

- Pin increases priority; still subject to `maxLiveIframes`.
- Soft cap `maxPinned` (default 6): additional pins → diagnostic toast `PIN_DEFERRED`, not silent.
- `defaultPinned` from config for critical routes (`/login`, `/`).

### 7.6. Near-viewport virtualization (node chrome)

Separate from iframe policy:

1. **Tier A (far):** compact shell, no IO registration, no heavy subtrees.  
2. **Tier B (near):** full chrome + IO.  
3. **Tier C (live set):** iframe slot mounted.

Distance metric from React Flow viewport rect vs node position/size (math in store), update on `moveend` / debounced `viewport` change — not every pixel.

### 7.7. Interaction & pointer events

- Default: iframe `pointer-events: none` so pan/zoom work.
- Selected node or explicit **Interact** toggle: `pointer-events: auto`.
- Without this, map is unusable (enterprise UX requirement).

### 7.8. Scaling iframe (50% / 75% / 100%)

- Fixed node geometry (e.g. 280×220 body).
- Inner iframe layout size = body / scale; CSS `transform: scale(scale)`.
- Changing scale does **not** remount iframe.

### 7.9. Performance budgets (normative)

| Metric | Budget |
|--------|--------|
| Max live iframes | 8 default |
| Max nodes full chrome (Tier B) | ~60 near viewport |
| Scan full (medium app 100 pages) | < 5s cold on laptop ref |
| Scan incremental (1 file) | < 300ms |
| Graph UI open to interactive | < 2s for 300 nodes map-only |
| Memory | no tab crash; soft warn at live>cap attempts |
| Reconcile | ≤ 1/frame coalesced |

### 7.10. State loss honesty

Freeze drops SPA client state inside iframe. Mitigations: pin; same-origin cookies survive; document in UI tooltip. Cross-origin state snapshot is **out of scope**.

### 7.11. Testing policy package

`iframe-policy` is **100% unit-tested** without DOM: tables of visible/pinned/selected → expected live set. This is a release gate.

---

## 8. Integration API

### 8.1. Zero-config Next.js (target DX)

```bash
pnpm add -D @live-app-map/next
```

```ts
// next.config.ts
import type { NextConfig } from 'next';
import { withLiveAppMap } from '@live-app-map/next';

export default withLiveAppMap({
  // all optional
  enabled: process.env.NODE_ENV === 'development',
})({
  // user next config
});
```

```tsx
// app/layout.tsx
import { LiveAppMapDevtools } from '@live-app-map/next';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <LiveAppMapDevtools />
      </body>
    </html>
  );
}
```

**What `withLiveAppMap` does:**

1. Dev-only: registers rewrite/route for `/__live-app-map/*` (graph JSON, optional UI assets).
2. Spawns or attaches **scanner watch** via `instrumentation.ts` hook or child process (implementation detail: prefer **child process** so scanner crash ≠ killing Next).
3. Injects nothing into production builds when `enabled: false`.

### 8.2. Dedicated route mode

```ts
// live-app-map.config.ts
export default defineConfig({
  route: '/dev/app-map',   // host visualizer as page
});
```

Or manual:

```tsx
// app/dev/app-map/page.tsx
import { LiveAppMapPage } from '@live-app-map/next';
export default function Page() {
  return <LiveAppMapPage />;
}
```

Guard with `process.env.NODE_ENV === 'development'` or auth in enterprise deployments.

### 8.3. React embed API

```tsx
import { LiveAppMap } from '@live-app-map/react';

<LiveAppMap
  document={doc}                 // or graphUrl="/__live-app-map/graph.json"
  mode="live"                    // live | map-only | compact
  baseUrl="http://localhost:3000"
  theme="system"
  maxLiveIframes={8}
  onNodeOpen={(n) => window.open(n.url)}
  className="h-screen"
/>
```

```tsx
import { LiveAppMapDevtools } from '@live-app-map/react';

// floating button, portal panel — same as RQ devtools positioning API
<LiveAppMapDevtools initialIsOpen={false} position="bottom-right" />
```

### 8.4. CLI

```bash
live-app-map scan --dir . -o appmap.json
live-app-map dev --target-url http://localhost:3000 --port 4310
live-app-map diff main.appmap.json HEAD.appmap.json
live-app-map export appmap.json --format appmap-zip -o map.appmap
live-app-map doctor   # env diagnostics
```

### 8.5. Config file (`live-app-map.config.ts`)

```ts
export default defineConfig({
  baseUrl: 'http://localhost:3000',
  exampleParams: { id: 'demo' },
  includeRouteHandlers: false,
  edge: { includeLowConfidence: false, maxFiles: 5000 },
  iframe: { maxLiveIframes: 8, maxPinned: 6, freezeStrategy: 'unmount' },
  ignore: ['**/_deprecated/**'],
  plugins: [],
  monorepo: { filter: 'web' },
});
```

Typed via `defineConfig` helper.

### 8.6. Programmatic scanner API

```ts
import { scanNextApp } from '@live-app-map/scanner-next';

const { document, diagnostics } = await scanNextApp({
  projectRoot: process.cwd(),
  exampleParams: { id: 'demo' },
});
```

### 8.7. Production safety

- Default: dead-code eliminate Devtools when `process.env.NODE_ENV === 'production'`.
- `enabled: true` in prod requires explicit `allowProduction: true` + warning banner (danger: exposes internal map).

---

## 9. Performance Budget & Constraints

### 9.1. Scanner

| Constraint | Value | Mitigation |
|------------|-------|------------|
| Route files | 300–500 typical enterprise | O(n) discover; fine |
| Edge AST files | cap 5k | page-local fallback |
| ts-morph cold start | costly | reuse Project; worker process; cache |
| Monorepo whole-repo scan | dangerous | require filter |
| Watch storms | many files | debounce + batch |

### 9.2. Visualizer

| Constraint | Value | Mitigation |
|------------|-------|------------|
| DOM nodes | 300 RF nodes | compact mode; near-viewport tiers |
| Live iframes | ≤ 8 | reconcile |
| Layout | dagre O(n+e) | layout once; cache positions in session |
| Re-render | selection thrash | memo nodes; visibility outside React state |

### 9.3. Browser realities

- Each iframe ≈ separate process/site isolation (Chromium) → memory cliff.
- `X-Frame-Options` / CSP `frame-ancestors` blocks embedding even localhost sometimes — respect; show diagnostic.
- Same-origin with app: cookies work; still no free access to freeze state restore.
- Mobile browsers: tool is **desktop-first**; degrade to map-only on small viewports.

### 9.4. Reference hardware for claims

Document benchmarks on: 16GB RAM, mid CPU, Chromium, Next 15 app 200 routes. Publish in docs; CI perf smoke on fixtures.

---

## 10. Extensibility & Plugin System

### 10.1. Plugin types

```ts
interface LiveAppMapPlugin {
  name: string;
  version?: string;
  /** Discover/extra nodes after framework scan */
  contributeNodes?(ctx: ScanContext): Promise<AppMapNode[]> | AppMapNode[];
  /** Extra edges */
  contributeEdges?(ctx: ScanContext): Promise<AppMapEdge[]> | AppMapEdge[];
  /** Transform final document */
  transformDocument?(doc: AppMapDocument, ctx: ScanContext): AppMapDocument;
  /** UI: custom toolbar buttons / panels (visualizer host) */
  visualizer?(api: VisualizerPluginApi): void;
}
```

### 10.2. Examples

- Edge extractor for internal `navigateTo()` wrapper.
- CMS route contributor (fetch sitemap in dev).
- UI panel: “a11y checklist per route”.
- CI plugin: fail on `UNRESOLVED_TARGET` high count.

### 10.3. Safety

- Plugins run in **Node scanner process** (trusted, like eslint plugins) — document supply-chain risk.
- UI plugins: only registered components from import graph; no `eval` of remote code.
- Signature: publish plugin naming convention `live-app-map-plugin-*`.

### 10.4. Edge extractor helpers

Export utilities: `isLinkJsx`, `getStaticHref`, `matchRoute(path, nodes)` from `plugin-api` so plugins don’t reimplement resolution.

---

## 11. Security Considerations

| Risk | Mitigation |
|------|------------|
| `javascript:` / `data:` iframe URLs | allowlist `http:`/`https:` only in resolve |
| User-supplied graph JSON XSS | no `dangerouslySetInnerHTML` of map fields; text content only |
| iframe sandbox | default `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"`; configurable tighten |
| Devtools in production | off by default; explicit opt-in |
| Path traversal in scanner | stay within `projectRoot` realpath |
| SSRF via baseUrl in CI | CLI doesn’t fetch arbitrary iframe targets server-side for scan |
| Secrets in diagnostics | never embed `.env` values; redact absolute user home paths optionally (`sanitizePaths`) |
| Plugin malware | same trust model as eslint; recommend lockfile + reviewed plugins |
| Clickjacking user app | we are the embedder; user app headers may block us — OK |
| Multi-tenant host of maps | out of scope for core; if SaaS later, isolate tenants |

**Enterprise note:** offer `sandbox` preset `strict` (no same-origin) for untrusted baseUrl demos — breaks some apps; document tradeoff.

---

## 12. Testing Strategy

### 12.1. Layers

| Layer | Tool | What |
|-------|------|------|
| Unit | Vitest | segment parser, example params, reconcile policy, diff, href resolve |
| Fixture integration | Vitest + real dirs under `fixtures/` | App Router complex, pages, hybrid |
| Scanner golden | compare graph JSON to committed golden (stable ids) | |
| Visualizer RTL | Testing Library | mode switch, selection highlight |
| Policy tables | Vitest | pin/visible matrix |
| E2E | Playwright | playground app: open devtools, node count, live ≤ cap |
| CI multi-OS | GH Actions | win/linux path normalization |
| Perf smoke | script | scan time + node count thresholds on complex fixture |

### 12.2. Golden tests discipline

- Node ids must be **platform-stable** (posix paths in ids).
- Sort nodes/edges before serialize.
- Update goldens via explicit `UPDATE_GOLDEN=1`.

### 12.3. Fixture matrix (minimum)

1. Static pages only  
2. Dynamic + catch-all + optional catch-all  
3. Route groups  
4. Parallel routes  
5. Intercepting routes  
6. Hybrid app+pages  
7. `basePath` set  
8. `src/app`  
9. Monorepo two apps  
10. Synthetic 200-page generator for perf  

### 12.4. Quality gates for release

- Unit + golden pass  
- Policy package 100% branch on reconcile  
- Playwright smoke pass  
- `pnpm publint` / exports check  
- Types: `tsc --noEmit` all packages  

---

## 13. Documentation & DX Plan

### 13.1. Doc site IA

1. Introduction & vision  
2. Quickstart (Next 5 minutes)  
3. Concepts: nodes, edges, layers, modes  
4. Scanning: App Router, Pages, limitations  
5. Dynamic routes & example params  
6. Iframe performance & pin  
7. Configuration reference  
8. CLI reference  
9. Embed API  
10. Plugins  
11. CI & diff  
12. Export formats (JSON, .appmap)  
13. Security  
14. Troubleshooting / diagnostics codes catalog  
15. Migration guides  
16. Changelog (Changesets)  
17. Contributing & architecture (this TDD linked)  

### 13.2. DX details

- `live-app-map doctor` — Next version, app dir found, tsconfig, port conflicts.  
- Every diagnostic code has docs anchor `#code-UNRESOLVED_TARGET`.  
- Error UI copy in **English** for OSS default; i18n optional later (RU locale pack plugin).  
- Copy-paste configs in quickstart.  
- Video/GIF: open map, pin, search (docs site).  

### 13.3. Support posture (3–5y)

- LTS track: support Next **N and N-1** major releases.  
- Deprecation window: 6 months for public API.  
- Format v1 frozen after GA; v2 additive then major.  

---

## 14. Phased Roadmap (enterprise quality each phase)

Not “MVP then quality” — each phase ships production-grade tested surface; scope grows.

### Phase A — Foundation (Graph + Next discover)

**Ship:** monorepo skeleton; `@live-app-map/schema`, `graph`, `scanner-core`, `scanner-next` (pages + app static/dynamic/groups); CLI `scan`; goldens; docs quickstart scan-only.

**Quality bar:** deterministic ids; diagnostics; CI; no visualizer yet required for A but schema frozen.

### Phase B — Edges + materialization

**Ship:** Link/push/redirect extractors; exampleParams; `doctor`; hybrid app/pages; monorepo filter.

**Quality bar:** confidence levels; golden edges; performance cap.

### Phase C — Visualizer + iframe policy

**Ship:** `iframe-policy`, `visualizer`, `react` embed; modes live/map-only/compact; freeze/pin/budget; dark/light; search, minimap, highlight; playground 200 routes.

**Quality bar:** policy unit tests; Playwright live-count ≤ cap; pointer-events UX.

### Phase D — Next integration polish

**Ship:** `@live-app-map/next` withLiveAppMap + Devtools + `/__live-app-map`; watch incremental; dedicated route mode.

**Quality bar:** zero-config story on clean `create-next-app`; production tree-shake test.

### Phase E — Enterprise workflow

**Ship:** `diff` + CI example; export JSON/.appmap; path sanitization; config schema; plugin API stable; parallel/intercept richer modeling; layout structure layer UX.

**Quality bar:** migration guide; publint; multi-app composite optional.

### Phase F — Ecosystem expansion

**Ship:** `scanner-react-router`; more edge plugins; optional screenshot capture pipeline; ELK layout option; VS Code sidebar (optional).

**Quality bar:** same gates; RR documented limitations.

### Phase G — Long-term

Optional SaaS compare hosted maps; team annotations; AI-suggested missing links (never replace static scanner); performance profiler panel.

---

## 15. Risks & Mitigations

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| R1 | Incomplete edge extraction → false confidence | High | High | confidence field; diagnostics; docs honesty; plugins |
| R2 | Next.js convention churn | High | Medium | adapter per Next major; fixture matrix; LTS policy |
| R3 | Iframe memory crashes | Critical | High | hard budget; map-only default on low memory; freeze |
| R4 | Frame blocking headers | Medium | Medium | detect; disable iframe; map-only still useful |
| R5 | Parallel/intercept live mismatch | Medium | High | document; structure edges; don’t fake modal hard-load |
| R6 | ts-morph perf on huge repos | High | Medium | caps; worker; incremental; optional babel-only mode |
| R7 | Monorepo scans wrong root | Medium | Medium | doctor + explicit filter |
| R8 | Devtools shipped to prod | High | Low | NODE_ENV + allowProduction gate + bundle test |
| R9 | Plugin supply chain | High | Low | trust model docs; no remote plugin fetch |
| R10 | RF performance at 300+ | Medium | Medium | compact mode; measure; contingency canvas |
| R11 | Dynamic href black hole | Medium | High | low-confidence opt-in; don’t spam edges |
| R12 | Windows path instability | Medium | Medium | posix normalize in ids; CI on Windows |
| R13 | Auth walls in iframes | Medium | High | pin login; cookie same-site notes |
| R14 | Format drift vs visualizer | High | Medium | single schema package; contract tests |

---

## 16. Success Metrics

### 16.1. Product / quality metrics

| Metric | Target (12 months post-GA) |
|--------|----------------------------|
| Time-to-first-map (clean Next app) | ≤ 5 minutes reading docs + install |
| Route discovery recall on fixture complex | **100%** of filesystem pages |
| Edge precision (high confidence) | ≥ 95% on golden fixtures |
| Edge recall (all static Link/push literals) | ≥ 90% on golden fixtures |
| Crash-free sessions (playground 200 live mode pan 2 min) | ≥ 99% internal dogfood |
| Live iframe count never exceeds max | **100%** (invariant test) |
| Scan p95 on 200-route fixture | < 5s |
| Open issues “wrong missing page” severity | trend down after each Next major |

### 16.2. Adoption metrics (directional)

- Weekly downloads `@live-app-map/next`
- GitHub stars / unique clone CI using `diff`
- Plugin registry count (community)

### 16.3. Maintainability metrics

- Mean time to support new Next major (fixture + adapters green) ≤ 30 days after Next stable
- Public API breaking majors ≤ 1 / year
- Docs diagnostics coverage: every code has an anchor

### 16.4. Definition of enterprise-ready (GA checklist)

- [ ] Phases A–D complete with quality bars  
- [ ] Schema v1 frozen + migration policy published  
- [ ] Security section reviewed  
- [ ] Playwright + golden CI required on main  
- [ ] LTS Next N/N-1 stated  
- [ ] Changelog + migration guides process  
- [ ] Performance budgets measured & published  
- [ ] Plugin API documented with 1 official example plugin  

---

## 17. Decision Log (ADR-style, concise)

| Decision | Choice | Alternatives rejected | Why |
|----------|--------|----------------------|-----|
| Discovery source of truth | Filesystem conventions + static AST | Runtime crawl primary | Crawl misses dead routes; needs auth; non-deterministic |
| Scanner runtime | Node worker/child | In-browser FS | Incomplete monorepo access |
| Graph canvas | @xyflow/react | Cytoscape, custom WebGL | Faster delivery; custom nodes; revisit on data |
| State | Zustand | Redux, Jotai | Embed simplicity |
| Iframe unload | Unmount default | Keep hidden iframes | Memory |
| Edge quality | Confidence levels | Binary present/absent | Honest DX |
| Integration | Opt-in component + optional withNext | Automatic silent inject always | Predictability & security |
| Format | Own `formatVersion` JSON | Only .appmap | Web-first; bridge export |

---

## 18. Open Questions (resolve before Phase C freeze)

1. Default mode on first open: `map-only` (safer) vs `live` (wow)? **Recommendation:** `map-only` first paint, user toggles Live (or auto-live if node count ≤ 20).  
2. Include `route.ts` handlers in default graph? **Recommendation:** off by default, toggle on.  
3. Should layout nodes be iframe-able? **Recommendation:** no — structure only.  
4. Composite multi-app graph v1 or filter-only? **Recommendation:** filter-only until Phase E.  

---

## 19. Document History

| Ver | Date | Notes |
|-----|------|-------|
| 1.0 | 2026-08-10 | Initial enterprise TDD; supersedes viewer-only draft as product canon |

---

*End of Technical Design Document. Implementation is a separate execution track against Phases A→G.*
