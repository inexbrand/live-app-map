# План

1. Падающий live-тест `packages/db/src/__tests__/seed-lam-demo.live.test.ts`.
2. `packages/db/scripts/seed-lam-demo.ts`: seedLamDemo + main (DATABASE_URL, поиск пользователей по tg из LAM_USERS).
3. package.json: seed:lam-demo.
4. typecheck @korbor/db, тест зелёный.
5. dev-база: сид ×2, живые запросы, снимки.
6. Коммит korbor; строка в памяти live-app-map; эпоха 06–09; коммит live-app-map.

## Файлы

- korbor: packages/db/scripts/seed-lam-demo.ts, packages/db/src/__tests__/seed-lam-demo.live.test.ts, packages/db/package.json
- live-app-map: docs/agent-notes/memory/korbor-local-run.md (одна строка), эпоха
