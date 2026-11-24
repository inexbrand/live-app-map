# Impact

- korbor: новый скрипт `packages/db/scripts/seed-lam-users.ts`, `seed:lam-users` в package.json @korbor/db; код API не тронут.
- visualizer: `lib/stream/stream-service.ts` (готовность документа, повтор перехода), `lib/gateway/page-settle.ts` (общее правило «догрузилась» со снимком), `snapshot-service.ts` (использует его), `sample-ids.ts` (заголовки входа), `sessions-middleware.ts`, `session-store.ts` (ensureFresh по истёкшей куке — затрагивает и шлюз страниц: вход выдаётся заново раз в ~15 мин), `cookie-jar.ts`.
- Новая devDependency `jpeg-js` (только тест).
