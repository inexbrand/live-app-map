# 04 — План проверки (реальные вызовы)

1. `bun test packages/scanner-source` — сканер на фикстуре `fixtures/source-elysia-drizzle` (Elysia + Drizzle + Prisma + Hono + Express + React-компонент): символы с JSDoc/строкой, роуты с методом/путём/описанием, вызовы БД, таблицы с колонками.
2. `bun test packages/schema` — v1 → v2, Zod принимает `code`, конверт viewer ↔ enterprise сохраняет `code`.
3. `bun test packages/cli` — `runScan({ codeDir })` и `runCodeScan` на фикстуре.
4. `bun test apps/visualizer-spa/src` — `filterCanvasGraph` показывает сервисы; выбор кода для панели (`selectNodeCode`).
5. Живой запуск: `bun run packages/cli/src/bin.ts code --dir /Users/macbook/orca/korbor -o …` и по vpn-saas; цифры роутов/таблиц/запросов; `bun run dev` на :4310, загрузить карту, кликнуть сервис, увидеть панель (Playwright-скриншот).
6. typecheck затронутых пакетов (schema, scanner-source, cli, visualizer-spa).
