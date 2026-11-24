# Что сделано

## Изменения

korbor, коммит 487bb87 (main, запушен):
- `packages/db/scripts/seed-lam-demo.ts` — seedLamDemo(db, parties, now), чтение platform_config, main (поиск пользователей автовхода по tg).
- `packages/db/scripts/seed-lam-demo-rows.ts` — buildLamDemoRows: чистая сборка строк всех таблиц, lamDemoId.
- `packages/db/scripts/seed-lam-demo-data.ts`, `seed-lam-demo-chat-data.ts` — каталог текстов.
- `packages/db/src/__tests__/seed-lam-demo.live.test.ts` — live-тест.
- `packages/db/package.json` — команда seed:lam-demo.

live-app-map: строка в `docs/agent-notes/memory/korbor-local-run.md`.

## Команды проверки

- `cd packages/db && TEST_DATABASE_URL=<dev> bun test src/__tests__/seed-lam-demo.live.test.ts src/__tests__/seed-lam-users.live.test.ts` — 6 pass. Первый прогон без модуля — красный (Cannot find module), второй — красный на повторе (notifications 30 → 34), после правки id уведомлений — зелёный.
- `bunx tsc --noEmit -p tsconfig.json` (@korbor/db) — чисто.
- `bunx oxlint scripts/seed-lam-demo*.ts` — чисто (до правки: no-known-value-widening, no-runtime-typeof — исправлены: именованный тип, zod).
- dev-база: `bun run --filter @korbor/db seed:lam-demo` ×2 — оба раза «вакансий 8, кандидатов 6, сделок 2, звонков 1», количества строк одинаковые.

## Не сделано

(пусто)
