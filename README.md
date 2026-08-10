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
| `@live-app-map/export-appmap` | `.appmap` zip bridge |
| `@live-app-map/cli` | `scan` / `diff` / `doctor` |
| `@live-app-map/react` | embed + Devtools shell |
| `apps/visualizer-spa` | full UI on port **4310** |

## Quick start

```bash
bun install
bun test
bun run scan:korbor
bun run dev:visualizer
```

Откройте http://localhost:4310 → кнопки **Korbor Miniapp / Admin / Site**.

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
http://localhost:4310/?map=/maps/korbor-miniapp.liveappmap.json&baseUrl=http://localhost:5175&role=recruiter
```

## CLI

```bash
bun run packages/cli/src/bin.ts scan --dir ../korbor/apps/miniapp --base-url http://localhost:5175 -o maps/out.json
bun run packages/cli/src/bin.ts doctor --dir ../korbor/apps/site
bun run packages/cli/src/bin.ts diff maps/a.json maps/b.json
```

## Tests

```bash
bun test packages
bun test apps/visualizer-spa
```
