# Research

## Как сейчас

- `apps/visualizer-spa/src/components/DatabaseView.tsx` — список таблиц слева (`TableList`) + `TableDetail` (колонки, ReferencedBy, RouteList чтения/записи с экранами).
- `apps/visualizer-spa/src/lib/db-view-model.ts` — `dbIndexOf`, `tableRows`, `tableView` поверх `buildCodeIndex`/`tableDetail` (`packages/graph`).
- Схема таблиц — `DbTable`/`DbColumn` (`packages/schema/src/code-model.ts`), снимает `packages/scanner-source/src/drizzle-columns.ts`. У `SourceLocation` только начальная строка.
- Упоминания таблицы в документах — граф `buildDocGraph` (`apps/visualizer-spa/src/lib/doc-graph.ts`): узел `table:<exportName>`, рёбра `links` от документов.
- Замечания — `.lam-feedback`, схема `packages/mcp-server/src/comments-schema.ts`; привязка `anchor.pageId` + `element.component.source` (origin `code-map`). API `/api/comments`.
- Конфиг проекта — `LamProjectConfig` (`packages/sdk/src/project.ts`), отдаётся `/__lam_project/config` (`lib/project/project-server.ts`).
- Dev REST — middleware в `apps/visualizer-spa/vite.config.ts` (`mountApi`).
- Живого подключения к БД нет. Postgres-драйвера в зависимостях нет. Разделителей панелей (resizable) нет.
- korbor: Postgres `localhost:16432`, адрес — `DATABASE_URL` в `dev.local.env`.

## Drizzle Studio (образец)

Слева таблицы, в центре сетка строк с правкой ячеек, добавлением и удалением, правки копятся до «Save changes»;
отдельный вид схемы — карточки таблиц с колонками и связи линиями.

## Покрытие

| Нужно | Есть | Нет |
|---|---|---|
| Список таблиц | да | — |
| ER-схема | — | новая |
| Данные таблицы, CRUD | — | сервер + сетка |
| Документация таблицы | частично (без эпох) | эпохи из графа |
| Код объявления | только file:line | эндпоинт исходника + вкладка |
| Замечание к схеме | только к экранам | привязка к таблице |
| Изменение размеров панелей | — | resizable |
