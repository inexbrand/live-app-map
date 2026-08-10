# Live App Map

Professional developer tool: сканирует Next.js / React Router приложения, строит граф экранов и показывает **живые iframe** с бюджетом памяти (freeze/pin).

Канон: [`docs/live-app-map-enterprise-tdd.md`](./docs/live-app-map-enterprise-tdd.md) · viewer seed: [`docs/live-app-map-design.md`](./docs/live-app-map-design.md).

## Packages

| Package | Role |
|---------|------|
| `@live-app-map/schema` | formatVersion 1, Zod, liveappmap convert |
| `@live-app-map/graph` | index, search, diff, URL + state inject |
| `@live-app-map/diagnostics` | codes + formatters |
| `@live-app-map/scanner-core` | walk, materialize params |
| `@live-app-map/scanner-next` | App/Pages Router |
| `@live-app-map/scanner-react-router` | RR path configs |
| `@live-app-map/iframe-policy` | pure reconcile budget |
| `@live-app-map/export-appmap` | экспорт `.appmap` zip (bridge из liveappmap) |
| `@live-app-map/plugin-api` | контракты плагинов + `applyPlugins` |
| `@live-app-map/cli` | `scan` / `diff` / `doctor` / `export` / `feedback` / `dev` |
| `@live-app-map/mcp-server` | stdio MCP: map pages + feedback |
| `@live-app-map/react` | embed + Devtools shell |
| `@live-app-map/next` | Next.js `withLiveAppMap` + rewrites/env |
| `@live-app-map/visualizer` | core utils (graph + iframe-policy re-export) |
| `apps/visualizer-spa` | full UI on port **4310** (Manrope monochrome UI kit + Lucide) |

## Quick start

```bash
bun install
bun run typecheck
bun test
bun run scan:korbor
bun run dev          # visualizer :4310
```

Откройте http://localhost:4310 → пресеты **Korbor Miniapp / Admin / Site**.

### UI kit (канон)

- **Manrope** + monochrome tokens (`--background` … `--border`)
- **Lucide** icons only (no emoji)
- Primitives: `apps/visualizer-spa/src/ui/*` — Button, Field/Input/Select/Textarea, Chip/Badge, Panel

### Feedback → CLI / MCP

1. Клик по экрану на карте  
2. Слева **Feedback / промпт**: severity + note + optional chrome snapshot  
3. **Копировать промпт** или **JSON для CLI**

```bash
bun run feedback -- --file ./lam-feedback-….json --print-prompt
# пишет .lam-feedback/*.md + *.json

bun run mcp
# tools: list_map_pages, get_page, submit_feedback, list_feedback
```

### Korbor ports (dev.local.env)

| Surface | URL |
|---------|-----|
| API | http://localhost:16000 |
| Site | http://localhost:16001 |
| Admin | http://localhost:16002 |
| Miniapp | https://vite.localhost:5175 (Vite TLS host) |
| Visualizer | http://localhost:4310 |

### State injection (роли miniapp)

В тулбаре visualizer:

- **Роль → Рекрутер** — `?lam_role=recruiter` на live URL
- **Роль → Клиент (employer)** — `?lam_role=employer`

На нодах miniapp есть chips `recruiter` / `employer`. Выбранная нода открывает панель стейтов.

```text
http://localhost:4310/?map=/maps/korbor-miniapp.liveappmap.json&baseUrl=https://vite.localhost:5175&role=recruiter
```

## CLI

```bash
bun run packages/cli/src/bin.ts scan --dir ../korbor/apps/miniapp --base-url https://vite.localhost:5175 -o maps/out.json
bun run packages/cli/src/bin.ts doctor --dir ../korbor/apps/site
bun run packages/cli/src/bin.ts diff maps/a.json maps/b.json
bun run packages/cli/src/bin.ts feedback --file maps/sample-feedback.json --print-prompt
```

## Verify

Полный список проверок monorepo (из корневого `package.json`):

```bash
bun install
bun run typecheck
bun test
bun test packages
bun test apps/visualizer-spa
bun run test:unit
bun run test:e2e
bun run smoke
bun run doctor -- --dir ../korbor/apps/site
bun run build
bun run scan:korbor
bun run dev:visualizer
```

| Команда | Что проверяет |
|---------|----------------|
| `bun run typecheck` | `tsc --noEmit` во всех workspaces |
| `bun test` / `bun run test:unit` | unit/integration: packages + visualizer-spa/src + scripts |
| `bun run test:e2e` | Playwright e2e (`apps/visualizer-spa`) |
| `bun run smoke` | runtime smoke (`scripts/runtime-smoke.ts`) |
| `bun run doctor` | CLI doctor по каталогу приложения |
| `bun run build` | build всех workspaces |
| `bun run scan:korbor` | dogfood-скан Korbor → maps |
| `bun run dev:visualizer` | dev SPA на порту **4310** |
