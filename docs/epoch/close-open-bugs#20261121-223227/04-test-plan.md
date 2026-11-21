# План тестов

## Unit

- graph: `diffDocuments` на документах с code.routes/tables — добавлено/пропало/изменилось.
- scanner-source: `scanSource` на фикстуре Elysia с t.Optional(t.Object), вложенными объектами, ссылкой на константу, t.Record.
- scanner-docs: `setBugItemState` — чекбоксы и разделы Open/Closed, идемпотентность.
- dev-middleware: настоящие http-запросы к middleware (версии из git временного репозитория, запись 09-bugs во временную папку).
- gateway-store: повтор после ошибки — через настоящий http-сервер.

## E2E / frontend

- compare.e2e: выбрать «Было» = коммит, «Стало» = открытая карта / импорт изменённой копии → секции добавлено/пропало.
- docs-bugs.e2e: импорт карты временного проекта → отметить пункт → подтверждение → файл на диске изменён, готовность «готово».
- import-clear.e2e: после импорта селект показывает имя файла.

## Реальные вызовы

- `bun run scan:korbor` в temp-каталог, живой :43xx dev-сервер, Playwright.
