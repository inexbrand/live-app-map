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

## Пресеты Korbor

Кнопки тулбара / `KORBOR_PRESETS` (`src/korbor-presets.ts`):

| id | label | map (public) | baseUrl (dev) |
|----|-------|--------------|---------------|
| `miniapp` | Korbor Miniapp | `/maps/korbor-miniapp.liveappmap.json` | `https://vite.localhost:5175` |
| `admin` | Korbor Admin | `/maps/korbor-admin.liveappmap.json` | `http://localhost:16002` |
| `site` | Korbor Site | `/maps/korbor-site.liveappmap.json` | `http://localhost:16001` |

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
bun run test:e2e         # Playwright (нужен dev-сервер / config)
bun run build
bun run preview          # http://localhost:4310
```

## Зависимости monorepo

- `@live-app-map/schema` — parse + convert enterprise ↔ liveappmap
- `@live-app-map/graph` — index, search, resolve URL, state inject
- `@live-app-map/iframe-policy` — pure reconcile бюджета iframe
- `@live-app-map/export-appmap` — bridge `.appmap` zip
