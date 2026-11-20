# `apps/visualizer-spa` (`@live-app-map/visualizer-spa`)

SPA visualizer Live App Map: граф экранов (`@xyflow/react`) + live iframe с бюджетом (`@live-app-map/iframe-policy`).

Стек: React 19, Vite, Zustand, пакеты monorepo (`schema`, `graph`, `iframe-policy`, `export-appmap`).

## Порт

**Dev / preview: `http://localhost:4310`**

Задано в `package.json` (`vite --port 4310`) и `vite.config.ts` (`server.port: 4310`).

```bash
# из корня monorepo
bun run dev:visualizer

# или из apps/visualizer-spa
bun run dev
```

Откройте http://localhost:4310

## Каталог карт

Dev-сервер собирает `/maps/index.json` из всех `public/maps/*.liveappmap.json`
(`src/lib/build-map-catalog-fs.ts`): любая карта в папке появляется в селекте.
Карты Korbor получают подпись и baseUrl из `KORBOR_PRESETS`, остальные — из своего JSON
(`app.name`, `baseUrl`). Битые файлы попадают в `skipped` каталога.

## Эндпоинты dev-сервера

| Путь | Что делает | Модуль |
|------|------------|--------|
| `GET /maps/index.json` | каталог карт | `build-map-catalog-fs` |
| `POST /mcp` | MCP JSON-RPC (tools из `@live-app-map/mcp-server`) | `mcp-middleware` |
| `GET/POST /api/agent-state`, `POST /api/agent-state/snapshot` | состояние для агента, просьбы и снимки | `agent-state-middleware` |
| `POST /api/error-reports` | ошибки клиента → `.lam-feedback/error-reports.jsonl` | `error-reports-middleware` |
| `/__lam_proxy/https/<host:port>/…` | прокси локального HTTPS (self-signed) | `https-path-proxy` |

Запросы с не-локальным `Origin` получают 403 (dev-сервер слушает все интерфейсы).
Vite запускается под Bun (`bun --bun vite`): конфиг импортирует workspace-пакеты в виде `.ts`.

## Снимок экрана

Кнопка «Снимок» в панели замечания или Alt+Shift+S: браузер спрашивает доступ к вкладке
(Screen Capture API), затем выделяется область; PNG снимается вместе с cross-origin iframe.
Просьба агента (`request_snapshot`) показывает карточку «Агент просит снимок»; просьбы старше
10 минут не показываются. Логика: `src/lib/snapshot/*`, `src/store/snapshot-store.ts`,
`components/LamGrabHost.tsx` (поток и мост к агенту), `components/SnapshotOverlay.tsx` (интерфейс).

## Пресеты Korbor

Кнопки тулбара / `KORBOR_PRESETS` (`src/korbor-presets.ts`):

| id | label | map (public) | baseUrl (dev) |
|----|-------|--------------|---------------|
| `all` | Весь Korbor | `/maps/korbor-all.liveappmap.json` | `http://localhost:16001` (у страниц свои абсолютные URL) |
| `miniapp` | Мини-приложение | `/maps/korbor-miniapp.liveappmap.json` | `https://vite.localhost:5175` |
| `admin` | Админка | `/maps/korbor-admin.liveappmap.json` | `http://localhost:16002` |
| `site` | Сайт | `/maps/korbor-site.liveappmap.json` | `http://localhost:16001` |

Файлы лежат в `public/maps/*.liveappmap.json` (viewer-формат **liveappmap**, не сырой enterprise).  
Пример: `public/examples/demo-shop.liveappmap.json`.

Query deep-link:

```text
http://localhost:4310/?map=/maps/korbor-miniapp.liveappmap.json&baseUrl=http://localhost:5175&role=recruiter
```

### Роли (state inject)

В тулбаре / `StateInjectPanel`:

- **Рекрутер** → `?lam_role=recruiter`
- **Клиент (employer)** → `?lam_role=employer`

На нодах miniapp — chips `recruiter` / `employer`.

## Форматы карт

| Формат | Откуда | Как в SPA |
|--------|--------|-----------|
| **liveappmap** | `*.liveappmap.json` | Пресеты, import, `public/maps` |
| **enterprise** | scan CLI (`AppMapDocument`) | Импорт/конверт через `@live-app-map/schema` (`liveAppMapToAppMap` / `appMapToLiveAppMap`) |

Сканирование Korbor из корня:

```bash
bun run scan:korbor
```

## Проверка (verify)

Из **корня** monorepo:

```bash
bun install
bun run typecheck
bun test
bun test packages
bun test apps/visualizer-spa
bun run test:unit
bun run build
bun run dev:visualizer
bun run scan:korbor
bun run doctor
bun run scan
```

Локально в приложении:

```bash
cd apps/visualizer-spa
bun run typecheck
bun test                 # unit (src/**)
bun run test:e2e         # Playwright: smoke, import-clear, snapshot (поднимает dev сам)
bun run build
bun run preview          # http://localhost:4310
```

## Зависимости monorepo

- `@live-app-map/schema` — parse + convert enterprise ↔ liveappmap
- `@live-app-map/graph` — index, search, resolve URL, state inject
- `@live-app-map/iframe-policy` — pure reconcile бюджета iframe
- `@live-app-map/export-appmap` — bridge `.appmap` zip