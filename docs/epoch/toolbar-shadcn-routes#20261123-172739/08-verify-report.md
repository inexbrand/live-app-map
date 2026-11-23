# Проверка

## Типы
`bunx tsc --noEmit -p apps/visualizer-spa` и `packages/graph` — без ошибок.

## Тесты (точечно по пакету SPA и graph)
- `bun test src` в `apps/visualizer-spa`: 733 из 735 зелёные. Падают 2 теста `src/lib/node-code.test.ts` (реальный скан `fixtures/source-monorepo` отдаёт пустые вызовы API) — этот файл и сканер правка не трогала, см. 09-bugs.
- `packages/graph/src/api-domains.test.ts` — 3/3.
- Первые прогоны всего SPA ловили «Iframe page loading is disabled» из соседних тестов (happy-dom); при прогоне файлов по отдельности не воспроизводится.

## Живой UI (:4310, карта korbor-all)
- Вид «API»: слева 48 доменов (auth, vacancies, deals…), admin/employer/recruiter доменами не стали; доска `PATCH /api/v1/admin/vacancies/:id`: «Принимает» (id, title, description, requirements, duties), «Отдаёт» (detail), «База данных» (добавляет access_logs, обновляет vacancies; колонки vacancies по раскрытию).
- Шапка на 1600 и 1280 px: вкладки не заходят под поиск; активная вкладка — тёмный текст на светлом.
- Экраны, База данных, Документация, Сравнение — открываются, ошибок страницы нет (только WebSocket HMR из живых кадров).

## korbor
api :16000/health 200, site :16001 200, admin :16002 200, miniapp https://vite.localhost:5175 200; `/api/lam-dev-auth/roles` отдаёт recruiter, employer, admin.
