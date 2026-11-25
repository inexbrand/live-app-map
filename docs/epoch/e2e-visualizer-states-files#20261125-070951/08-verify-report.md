# 08 — Проверка

- `bun test src/lib/stream/stream-server.test.ts`: до правки 2 pass / 1 fail («не дождались» кадров первой карты), после — 3 pass.
- tsc по visualizer-spa: ошибок в stream-server.ts, ApiView.tsx, e2e нет.
- Playwright, 4 файла, chromium, :4531: прогон all6 — 14 passed (1.2m), прогон all7 — 14 passed (41.7s), подряд. Прогон all5 до них: 3 падения в момент HMR App.tsx от другого агента (07:06:55).
