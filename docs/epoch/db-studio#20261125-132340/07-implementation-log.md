# Что сделано

## Изменения

## Команды проверки

## Не сделано

(должно быть пусто или blocker с evidence)


## lead (2026-11-25)

1. Контракт `lib/db-data/contract.ts` + 00–05 — коммит 1acad54 (до старта тиммейтов: им нужен общий тип).
2. Подняты тиммейты db-api (сервер /__lam_db) и db-grid (сетка) — зоны без общих файлов, кроме одной строки vite.config.
3. `bunx shadcn add resizable` → `components/ui/resizable.tsx`, зависимость react-resizable-panels 4.24.
4. `lib/erd-model.ts` — сначала тест (упал: нет модуля), потом модель; 4 теста зелёные.
5. `lib/project/source-statement.ts` — тест сначала (упал: нет модуля), реализация; 4 зелёных. `source-middleware.ts` + HTTP-тест на настоящем сервере (файл, выход за корень, 404/400) — 4 зелёных.
6. Замечание к коду: `code` в `commentAnchorSchema`, `commentPrompt`, `goToComment`; тест `comment-prompt.test.ts`.
7. `tableDocs` в db-view-model + тест.
8. Компоненты: TableCard, ErdCanvas, TableDocsTab (вынесено из старого DatabaseView + «Упоминается в документах»), TableCodeTab (код, CommentField, замечания таблицы), DatabaseView на панелях, стили.
9. DOM-тест `database-layout.test.tsx`: карточка на каждую таблицу korbor, 3 границы, клик по карточке выбирает таблицу, «Схема в коде» показывает код с номером строки, замечание уходит с привязкой `code`, ошибка видна под полем.
10. Коммиты: файлы забрал хук автосохранения другой сессии (9abb48f, d2bab3d) — сообщения «chore: auto-save», содержимое — то, что выше.

## Зона db-grid (сетка данных)

### Изменения
- `apps/visualizer-spa/src/lib/db-data/client.ts` — `createDbDataClient(base)`, `pageDbDataClient`, `rowsSearch`, `DbDataError`: ответы разбираются схемами контракта, ошибка — текст `DbError`, иначе код и тело.
- `apps/visualizer-spa/src/lib/db-data/edits.ts` — модель правок: editCell, addNewRow, editNewRow, removeNewRow, markDeleted, restoreRow, undoCell, editCount, buildChanges.
- `apps/visualizer-spa/src/components/database/DataGrid.tsx` (статус: off/error/только чтение), `DataGridBody.tsx` (загрузка страниц, правки, сохранение), `DataGridToolbar.tsx` (панель, фильтр, пагинация), `DataGridTable.tsx` (шапка, строки), `DataGridCell.tsx` (ячейка и редактор по типу), `data-grid.css`.
- Тесты: `lib/db-data/edits.test.ts`, `lib/db-data/client.test.ts` (node:http), `components/database/DataGrid.test.tsx` (happy-dom + node:http по контракту), замер `components/database/DataGrid.perf-test.tsx`.

### Команды проверки
- `bun test src/components/database/DataGrid.test.tsx src/lib/db-data/edits.test.ts src/lib/db-data/client.test.ts` → 20 pass, 0 fail.
- `bun test --conditions=require ./src/components/database/DataGrid.perf-test.tsx` → 1 pass; 50×30 с правкой ячейки: 11 рендеров, среднее 37,1 мс, redundantUpdates пусто.
- `bun run typecheck` → мои файлы без ошибок; единственная ошибка — `src/components/database/database-layout.test.tsx(22,19)` (не моя зона, FetchRoute).

- Живая проверка на korbor — см. 08 (правка ячейки и возврат через UI, Helium).
- После живой проверки: «2 строк» → `rowsLabel` (1 строка / 2 строки / 5 строк), тест в DataGrid.test.tsx.

### Не сделано
- Живые вставка/удаление в korbor (данные korbor трогаю только на одной строке) — покрыто живым тестом db-api.

## Зона db-api (сервер /__lam_db)

### Изменения
- `packages/sdk/src/project.ts` — тип `LamDatabase`, поле `LamProjectConfig.database`.
- `packages/cli/src/project/config.ts` — `databaseErrors`, `toDatabase`; тест `config-database.test.ts`.
- `apps/visualizer-spa/src/lib/db-data/db-target.ts` — разбор env, `resolveDbTarget`, `isLocalDbHost`, `dbTargetOf`.
- `db-sql.ts` — `quoteIdent`, `buildPageQueries`, `buildChangeStatements`, `DbHttpError`.
- `db-introspect.ts` — `INTROSPECT_SQL`, `tableMetaFromRows`, `introspectTable`.
- `db-ops.ts` — `dbPool`, `closeDbPool`, `pingDb`, `readRowsPage`, `applyChanges`, `dbErrorResponse`.
- `db-middleware.ts` — `createDbDataMiddleware`, `dbDataMiddleware`; строка в `vite.config.ts` (mountApi).
- Зависимость `postgres@4.1.1` в apps/visualizer-spa.
- korbor: `.live-app-map/config.ts` — `database: { urlEnv: 'DATABASE_URL', envFile: 'dev.local.env' }`.
- Большая часть файлов попала в автокоммиты хука (9abb48f, d2bab3d); остаток — коммитом зоны.

### Команды проверки
- `bun test src/project/config-database.test.ts` (packages/cli) → 3 pass.
- `bun test src/lib/db-data/db-target.test.ts src/lib/db-data/db-sql.test.ts` → 13 pass.
- `LAM_TEST_DATABASE_URL=<DATABASE_URL из korbor/dev.local.env> bun test src/lib/db-data/db-live.test.ts` → 11 pass (Postgres korbor :16432, песочница lam_test_<rand>, после прогона схем lam_test_% — 0).
- `bun run typecheck` (visualizer-spa) → мои файлы без ошибок; единственная ошибка — чужой `database-layout.test.tsx(22,19)`. `tsc --noEmit` packages/cli → 0 ошибок.
- Живой dev: `LAM_PROJECT=C:/work/korbor LAM_GATEWAY_PORT=4396 LAM_STREAM_PORT=4397 bun --bun vite --port 4395 --strictPort`:
  `/__lam_db/status` → `{"state":"ready","host":"localhost","database":"korbor","writable":true}`;
  `/__lam_db/rows?table=users&page=0&size=5` → 18 колонок, PK [id], total 2, 2 строки; sort=created_at&dir=desc → 200; sort=nope → 400 «нет колонки nope в таблице users»; table=nope → 404; POST без полей → 400 «inserts: Required»; пустой пакет → 200 нули. Сервер остановлен, порты 4395–4397 свободны.

### Не сделано
- Правка данных korbor через живой dev не делалась намеренно (данные korbor не трогаю) — запись проверена живым тестом в песочнице на той же БД.

## lead — после живой проверки

11. Живьём ER-схема на 75 таблицах korbor — узкая колонна 3300×12758 (LR). Замер раскладок на карте korbor: LR/RL 0.26, TB/BT 2.32 (ширина/высота). Тесты «схема шире, чем выше» и «без связей — рядами под схемой» (упали), переход на BT + ряды одиноких таблиц (14 у korbor) — зелёные.
12. Живьём «Схема в коде» открывалась прокрученной к полю: CommentField ставит фокус при появлении. Проп `autoFocus` (false во вкладке кода); проверка в DOM-тесте падает без правки и проходит с ней.
13. Подтверждение при смене таблицы с несохранёнными правками — одно место (`selectTable` в DatabaseView): список, схема, ссылки вкладки документации. DOM-тест: отказ оставляет таблицу, согласие меняет.
14. Тест comments-middleware: привязка `code` проходит HTTP и видна агенту в MCP get_comment. Формат описан в docs/comments-format.md.
