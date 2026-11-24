# Проверка

- korbor: `bun test src/__tests__/seed-lam-users.live.test.ts` с TEST_DATABASE_URL — 2/2; `bun run typecheck` @korbor/db — чисто; сид дважды — те же id.
- Снимки после сида: recruiter `/feed` — «Лента вакансий», employer `/employer/vacancies` — «Мои вакансии».
- visualizer: `bun test src/lib/stream src/lib/gateway src/store src/flow/page-node` — всё зелёное, кроме gateway-server (права 600 на Windows, падал до правки); новый тест кадров был красным (255) до правки, 4 прогона подряд зелёные; typecheck — чисто.
- sample-ids живьём: recruiter/employer/admin — 200, `/api/v1/admin/users` → id пользователя; списки вакансий/сделок — null, в базе 0 вакансий, 0 сделок, 0 откликов.
- Карта «Весь Korbor» в Helium после Fit View и 90 с: админка 0 белых из 58 (было 16), сайт: Marketing Home с содержимым; мини-апп 20 светлых плиток — настоящие экраны (лента, кошелёк) со светлой темой и пустыми данными, проверено по снимкам.
