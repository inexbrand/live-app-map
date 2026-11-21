# Live App Map

Professional developer tool: сканирует Next.js / React Router приложения, строит граф экранов и показывает **живые iframe** с бюджетом памяти (freeze/pin).

Канон: [`docs/live-app-map-enterprise-tdd.md`](./docs/live-app-map-enterprise-tdd.md) · viewer seed: [`docs/live-app-map-design.md`](./docs/live-app-map-design.md).

## Packages

| Package | Role |
|---------|------|
| `@live-app-map/schema` | formatVersion 2 (читает 1), раздел `code`, Zod, liveappmap convert |
| `@live-app-map/graph` | index, search, diff, URL + state inject |
| `@live-app-map/diagnostics` | codes + formatters |
| `@live-app-map/scanner-core` | walk, materialize params |
| `@live-app-map/scanner-next` | App/Pages Router |
| `@live-app-map/scanner-react-router` | React Router и TanStack Router: экраны и переходы |
| `@live-app-map/scanner-source` | исходники через TS compiler API: сервисы, роуты Elysia/Hono/Express с комментариями, схемой входа (Elysia `t.`, zod) и проверками доступа, вызовы Drizzle/Prisma, таблицы, функции с JSDoc, вызовы API фронтенда и связь экран → роут |
| `@live-app-map/scanner-docs` | раздел карты `docs`: эпохи `docs/epoch/<задача>#<дата>/` (готовность по открытым пунктам 09-bugs), `docs/agent-notes`, CLAUDE.md/AGENTS.md/README, `docs/*.md` |
| `@live-app-map/iframe-policy` | pure reconcile budget |
| `@live-app-map/export-appmap` | экспорт `.appmap` zip (bridge из liveappmap) |
| `@live-app-map/plugin-api` | контракты плагинов + `applyPlugins` |
| `@live-app-map/cli` | `scan` (+ `--code-dir`) / `code` / `diff` / `doctor` / `export` / `feedback` / `dev` |
| `@live-app-map/mcp-server` | stdio MCP: map pages + feedback |
| `@live-app-map/react` | embed + Devtools shell |
| `@live-app-map/next` | Next.js `withLiveAppMap` + rewrites/env |
| `@live-app-map/visualizer` | core utils (graph + iframe-policy re-export) |
| `apps/visualizer-spa` | full UI on port **4310** (Medeo Sans monochrome UI kit + Lucide) |

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

- **Medeo Sans** + monochrome tokens (`--background` … `--border`)
- **Lucide** icons only (no emoji)
- Primitives: `apps/visualizer-spa/src/ui/*` — Button, Field/Input/Select/Textarea, Chip/Badge, Panel

### Feedback → CLI / MCP

1. Клик по экрану на карте  
2. Слева **Замечание**: важность + текст + **Снимок** (выделите область мышью; снимается настоящая картинка вкладки вместе с iframe, браузер спросит доступ к вкладке; Alt+Shift+S — то же с клавиатуры)  
3. **Копировать промпт** или **Скачать JSON** для CLI

```bash
bun run feedback -- --file ./lam-feedback-….json --print-prompt
# пишет .lam-feedback/*.md + *.json

bun run mcp
# tools: list_map_pages, get_page, submit_feedback, list_feedback,
#        get_visualizer_state, request_snapshot, get_snapshot
```

Те же tools отдаёт dev-сервер визуализатора по HTTP: `POST http://localhost:4310/mcp` (JSON-RPC 2.0).
Агент видит, что открыто в визуализаторе (`get_visualizer_state`), и может попросить снимок
(`request_snapshot`): в визуализаторе появится карточка «Агент просит снимок», пользователь
выделит область, `get_snapshot` вернёт путь к PNG. Обмен идёт через `.lam-feedback/` в корне
монорепо (или `$LAM_FEEDBACK_DIR`). Ошибки клиента визуализатора пишутся в
`.lam-feedback/error-reports.jsonl`.

### Korbor ports (dev.local.env)

| Surface | URL |
|---------|-----|
| API | http://localhost:16000 |
| Site | http://localhost:16001 |
| Admin | http://localhost:16002 |
| Miniapp | https://vite.localhost:5175 (Vite TLS host) |
| Visualizer | http://localhost:4310 |

### Живые экраны: шлюз и профили входа

Dev-сервер визуализатора поднимает шлюз на **:4320** (`LAM_GATEWAY_PORT`). Экран открывается
как `http://<профиль>--<цель>--<ячейка>.localhost:4320/…`: у каждой ноды свой origin, поэтому
iframe одного приложения не делят sessionStorage и не уводят друг друга на чужие экраны.
Шлюз подставляет куки профиля, кладёт значения sessionStorage до загрузки приложения, снимает
X-Frame-Options/CSP и сообщает визуализатору высоту страницы и ответы API 401/403.

- **Настройки → Профили входа**: вход один раз (dev-вход korbor или вставка кук / ключа
  sessionStorage), роли recruiter / employer / admin. Профили лежат в `.lam-sessions/`
  (права 600, в `.gitignore`); браузер видит только имена ключей, не значения.
- Профиль экрана: роль стейта ноды → общая роль → первый профиль приложения → без входа.
- Значки на ноде: **не авторизован** (API ответил 401/403, в подсказке — путь), **обрезано**
  («Видно 844 из 5838 px»). Кнопка **целиком** в полосе размеров выбранной ноды растит ноду до
  высоты страницы; повторное нажатие — окно прежней высоты с прокруткой внутри.
- Токен админки korbor живёт ~15 минут — шлюз обновляет dev-вход сам.

### Память

Живых iframe не больше 6 (+2 тёплых); остальные экраны — JPEG-снимки, которые делает
headless Chromium в dev-процессе (`.lam-snapshots/`, в `.gitignore`). На korbor-all куча вкладки
в обзоре 180 → 140 МБ, утечки после переключений карт нет — замеры в
`docs/epoch/live-korbor-e2e#20261121-175119/measurements/`.

### Вид «База данных»

Кнопка в шапке (если в карте есть схема): таблицы с поиском, колонки (тип, PK, NOT NULL,
default, enum, внешний ключ с переходом), кто ссылается, роуты чтения и записи и экраны,
которые эти роуты вызывают (клик — экран на холсте).

### Вид «API»

Кнопка в шапке (если в карте есть роуты): дерево разделов и модулей по пути после `/api/vN`,
покрытие (описания, проверка входа, доступ, вызовы экранами — клик по «Описания» включает
фильтр «без описания»), поиск и фильтры метод / сервис / таблица / без описания. Карточка роута:
описание, схема входа по частям, роли, права и проверки доступа, таблицы чтения и записи
(клик — «База данных»), экраны-вызывающие (клик — экран на холсте), обработчик файл:строка.

### Вид «Документация»

Кнопка в шапке (если в карте есть `docs`, то есть скан с `--code-dir`): эпохи с датой, целью,
статусом из INDEX и готовностью по 09-bugs («не готово · N»), фильтр по готовности, поиск по
тексту всех документов; заметки агентов и руководства. Документ — markdown (GFM): вкладки файлов
эпохи словами, инлайн-код с роутом, таблицей или экраном карты — ссылка в карту, ссылки на другие
.md — переход, скриншоты эпохи сеткой с просмотром во весь экран (картинки отдаёт dev-эндпоинт
`/__lam_docs/asset`, только картинки внутри `docs/` корня).

### MCP как база знаний

`bun run mcp` и `POST /mcp` на dev-сервере, кроме страниц и замечаний, отдают код:
`list_services`, `list_routes`, `get_route`, `list_tables`, `get_table` — роуты с
комментариями, входом и доступом, таблицы с колонками и связями, экраны, вызывающие роут;
`describe_api` — архитектура API по сервисам и разделам с покрытием и фильтрами;
`list_epochs`, `get_epoch` (с файлом), `search_docs` — документация проекта из раздела `docs`.

### Сканер экранов

`scanner-react-router` понимает React Router (литералы `path`) и **TanStack Router**:
`createRoute({ getParentRoute, path, component })` с полным путём по цепочке родителей,
`createFileRoute('/…')`, переходы `Link to` / `navigate({ to })` / `redirect({ to })` из
файла экрана и его локальных импортов (общие для многих экранов файлы — оболочка, меню —
не считаются; переход через общий виджет помечен `confidence: low`).

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
