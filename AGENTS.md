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
bun run scan -- --project ../korbor
bun run dev -- --project ../korbor
bun run browser:stop   # погасить постоянный браузер трансляции (живёт после остановки dev)
```

## Korbor dogfood

Проект korbor: `../korbor/.live-app-map/config.ts` (приложения ниже, бэкенд `apps/api` + `packages/db`, связи вне кода — `links`),
карта — `../korbor/.live-app-map/map.json` (не в git, пишет `bun run scan -- --project ../korbor`).

| App | Dir | Live baseUrl | Roles |
|-----|-----|--------------|-------|
| miniapp | `apps/miniapp` | https://vite.localhost:5175 | recruiter, employer |
| admin | `apps/admin` | http://localhost:16002 | admin |
| site | `apps/site` | http://localhost:16001 | — |

Срезы карт korbor для тестов — `test-fixtures/maps/`.

Для карты korbor запускать `bun run dev -- --map` (в korbor): miniapp/admin/site — собранные сборки с пересборкой при правке
(SDK `@live-app-map/sdk/map-serve`), экраны грузятся вдвое дешевле dev-серверов. Эпоха `docs/epoch/map-prod-screens#…`.

### State inject (roles)

Роли — из `config.apps[].roles`: у каждого экрана приложения состояние на каждую роль, адрес `?lam_role=<роль>`
(miniapp: `recruiter`, `employer` — клиент, создаёт вакансии; admin: `admin`).

## Packages

See root `README.md`.
