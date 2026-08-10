# Live App Map — project agents

## What this repo is

Enterprise **Live App Map**: scanners + graph format + iframe-budget visualizer.
Canon: `docs/live-app-map-enterprise-tdd.md` (product), `docs/live-app-map-design.md` (viewer seed).

## Stack

- Bun workspaces monorepo
- TypeScript strict
- React 19 + Vite visualizer (`apps/visualizer-spa`, port **4310**)
- Zod schemas, Zustand store, `@xyflow/react`, pure `iframe-policy`

## Verify

```bash
bun install
bun test packages apps/visualizer-spa
bun run scan:korbor
bun run dev:visualizer
```

## Korbor dogfood

| Surface | Scan target | Live baseUrl |
|---------|-------------|--------------|
| Miniapp | `../korbor/apps/miniapp` | http://localhost:5175 |
| Admin | `../korbor/apps/admin` | http://localhost:16002 |
| Site | `../korbor/apps/site` | http://localhost:16001 |

Maps: `maps/korbor-*.json` + `apps/visualizer-spa/public/maps/*.liveappmap.json`.

### State inject (roles)

Miniapp roles in map states + toolbar:

- `recruiter` → `?lam_role=recruiter`
- `employer` (client creating vacancies) → `?lam_role=employer`

## Packages

See root `README.md`.
