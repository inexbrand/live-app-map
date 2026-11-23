# План тестов

| Что | Тест | Как проверяет |
|---|---|---|
| Домены, аудитории по данным | `packages/graph/src/api-domains.test.ts` | реальная функция на роутах admin/recruiter/auth; фильтр не меняет домен |
| Домены на настоящей карте korbor | `src/lib/api-docs-view-model.test.ts` | 314 роутов, нет доменов admin/employer/recruiter; доска PATCH /admin/vacancies/:id — домен, колонки, «Обновляет» |
| Что меняет | там же, `routeEffects` | insert/upsert/update/delete → подписи и имя таблицы в БД |
| Вид «API» как у пользователя | `components/ApiView.test.tsx` | клик по домену сужает список, «Все роуты», фильтры, покрытие раскрывается |
| Доска роута | `components/ApiRouteCard.test.tsx` | блоки «Принимает/Отдаёт/Доступ/База данных/Экраны/Код», колонки по раскрытию |
| Шапка | `components/toolbar/*.test.tsx` | поиск в центре, тема в настройках, Esc, списки shadcn через `test/select.ts` |
| Живой UI | снимки playwright `e2e/.shot*.mjs` | :4310, korbor-all, вид «API» с открытой доской, все виды без ошибок |
