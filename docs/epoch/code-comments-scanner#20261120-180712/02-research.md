# 02 — Разбор: как устроен live-app-map сейчас

Дата разбора: 2026-11-20, ветка от `master` 5fcebf8.

## Что это

Монорепо Bun + TypeScript. Сканеры читают исходники Next.js / React Router приложения и строят граф экранов (JSON-карта). Визуализатор (Vite + React 19 + @xyflow/react, порт 4310) рисует граф, где каждая нода экрана — живой iframe с бюджетом памяти (сколько iframe живы, сколько «тёплых», сколько заморожены).

## Формат карты (`packages/schema`)

Два формата и конверт между ними (`convert.ts`):

- **Enterprise `AppMapDocument`** (`formatVersion: 1`, `kind: 'live-app-map'`): `project` (root, framework), `baseUrl`, `nodes[]`, `edges[]`, `groups`, `layout`, `extensions`.
  - `AppMapNode`: `id` (`route:/path`), `kind` (`page | layout | route-handler | intercept | not-found | external | unknown`), `title`, `pathPattern`, `pathExample`, `url`, `source.file`, `states` (роли, инжект в iframe), `viewport`, `iframePolicy`, `metadata`.
  - `AppMapEdge`: `from`, `to`, `kind` (`link | push | redirect | parent | wraps …`), `confidence`, `source` (файл/строка/колонка).
- **Viewer `LiveAppMapDocument`** (`version: '1.0'`, `pages[]`, `edges[]`) — упрощённый формат из `docs/live-app-map-design.md`, его лежат файлы `*.liveappmap.json`.
- Границы: Zod-схемы в `zod.ts`, `parseAppMapDocument` / `parseLiveAppMapDocument` + предупреждения (дубли id, висячие рёбра). Major-версия > 1 у viewer-формата отклоняется.

Чего в формате нет: сервисов бэкенда, API-роутов с обработчиками, функций/компонентов, комментариев, запросов в БД и схем таблиц. Единственный близкий вид — `route-handler` (файлы `app/**/route.ts` в Next), без метода и описания.

## Сканеры

- **`scanner-core`**: `walkFiles` (обход с исключениями node_modules/dist/…), `detectFramework` (по package.json/next.config), `materializePath` (подстановка примерных параметров `[id]` → `demo`), `buildDocument` (сортировка, `revision` = sha256 нод/рёбер), `humanTitle`.
- **`scanner-next`**: каталоги `app/` и `pages/` → сегменты (`[id]`, `[...slug]`, `(group)`, `@slot`, `(.)intercept`) → ноды `page/layout/not-found/route-handler`; рёбра из `<Link href>`, `router.push/replace`, `redirect()` — **регулярками** по тексту файла.
- **`scanner-react-router`**: ищет файлы конфигурации роутов (`routes-config`, `router`, `nav`) и регулярками вытаскивает строки `path: '…'`. `source.file` у всех нод — файл конфигурации, а не компонент экрана.
- **`cli`** (`packages/cli`): `scan` (авто-выбор сканера, при неизвестном фреймворке — оба и выбор по числу страниц), `diff`, `doctor`, `export` (.appmap zip), `feedback`, `dev`.
- Ни один сканер не использует TypeScript compiler API: всё на регулярках, комментарии не читаются.

## Визуализатор (`apps/visualizer-spa`)

- Стор Zustand (`store/app-store.ts`, ~900 строк) хранит `AppMapDocument`; viewer-формат при загрузке конвертируется в enterprise (`loadUnknownJson`).
- `flow/AppMapCanvas.tsx`: берёт только ноды `page | not-found | external`, раскладка dagre (LR) или `position` из JSON, один тип ноды React Flow — `PageNode` (iframe + бюджет из `iframe-policy`).
- Правая панель `StateInjectPanel` — роль, состояния экрана, живой URL; левая `FeedbackPanel` — замечание для агента.
- Каталог карт: `GET /maps/index.json` строится vite-плагином из `public/maps/*.liveappmap.json`.

## Что работает (проверено 2026-11-20)

- `bun install` — ок.
- `bun test packages` — **170 pass / 0 fail** (19 файлов).
- `scan` по korbor: miniapp — 20 экранов / 2 ребра (react-router), admin — 58 / 33 (react-router), site — 2 страницы / 6 нод (next).

## Что сломано (проверено 2026-11-20)

1. **Визуализатор не запускается.** `bun run dev` падает: `vite.config.ts` импортирует `src/lib/build-map-catalog-fs`, `error-reports-middleware`, `agent-state-middleware`, `mcp-middleware` — этих файлов нет в git ни в одном коммите. Также нет `components/LamGrabHost`, `components/SnapshotOverlay`, `lib/load-map-preset`, `lib/map-catalog`, `lib/measure-iframe-height` (импортируются из `App.tsx`, `MapToolbar.tsx`, `PageNode.tsx`). Итого 9 файлов, 11 точек импорта.
2. **`bun run typecheck` красный во всех 14 пакетах**: в `schema/src/convert.ts:243` viewport viewer-формата (height необязателен) присваивается enterprise `DeviceViewport` (height обязателен); из `schema/index.ts` не экспортируются `DeviceViewport`, `MapViewportPreset`, `ViewportHeightMode`, которые импортирует SPA; `mcp-server/src/server.ts:225` — async-итерация по `ReadableStream`. В SPA ещё ошибки в тестах (документ старой формы `schemaVersion`, пресет `korbor-all`, которого нет).
3. **Тесты SPA + scripts**: 119 pass / 4 fail / 1 error — расхождение `maps/` и `public/maps`, проверка korbor-all, пресет `korbor-all` отсутствует в `KORBOR_PRESETS` (там id `all`).
4. `maps/*.json` сгенерированы на Windows (`project.root: C:\\work\\korbor…`) — пути не переносимы.

## Как устроены целевые проекты (только чтение)

- **korbor**: `apps/api` — Elysia, плагины вида `new Elysia({ name }).get('/api/v1/…', handler, { query })`, по одному-несколько роутов на файл, длинный JSDoc в шапке файла описывает роут. БД — Drizzle: таблицы в `packages/db/src/schema/*.ts` (`pgTable('legal_documents', {...})` с JSDoc над таблицей), запросы в «портах»/репозиториях (`db.select().from(applications)`), в самих обработчиках запросов почти нет.
- **vpn-saas**: 15 пакетов с Elysia, 12 с drizzle-orm. HTTP-роуты в `apps/*/src/http/*.ts` (`new Elysia({ name: '@vpn/billing/notify' }).post(...)`), много gRPC.

## Покрытие: что должна показывать карта «сервисы → роуты → БД → экраны»

| Сущность | Сейчас | После задачи |
|---|---|---|
| Экраны UI (Next/RR) | есть | без изменений |
| Сервисы (пакеты монорепо) | нет | ноды `service` |
| HTTP-роуты: метод, путь, обработчик | только `route.ts` Next без метода | Elysia/Hono/Express |
| Описание роута из комментария | нет | JSDoc/комментарий у вызова, у обработчика, шапка файла |
| Функции/классы/компоненты + JSDoc | нет | экспортируемые символы файла |
| Запросы в БД из обработчика | нет | Drizzle (`from/insert/update/delete`, `db.query.x`), Prisma (`prisma.x.findMany`) — в теле обработчика и в функциях того же файла, которые он вызывает |
| Схемы БД | нет | таблицы Drizzle (`pgTable/mysqlTable/sqliteTable`) с колонками, модели Prisma |
| Связь экран → роут API | нет | **не делается** (нужен разбор fetch/клиентов) |
| gRPC (vpn-saas) | нет | **не делается** |
| Межфайловая цепочка обработчик → репозиторий → БД | нет | **не делается** (только тот же файл) |
