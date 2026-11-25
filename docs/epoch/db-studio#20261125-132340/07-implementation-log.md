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

### Не сделано
- Живая проверка на korbor — ждёт готовности сервера db-api.
