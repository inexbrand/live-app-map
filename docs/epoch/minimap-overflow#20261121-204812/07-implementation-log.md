# Что сделано

## Изменения

- 12cdd37 мини-карта: `flow/minimap.ts` (minimapSize, layoutBounds, minimapFill), `flow/LamMiniMap.tsx`, AppMapCanvas, global.css без !important/contain: strict; e2e/minimap.e2e.ts.
- 1171eee колесо: `lib/iframe-wheel.ts`, `wheelScroll` + сообщение wheel в `lib/gateway/inject-script.ts`, нативный слушатель в PageNode; e2e/node-scroll.e2e.ts.
- 256f5c1 параметры маршрутов: `lib/route-samples.ts`, `lib/gateway/sample-ids.ts`, `korborBearer`, POST `/__lam_sessions/<профиль>/sample-ids`, кэш в gateway-store, подстановка в resolveLiveUrl, `pickNodeProfile`, хук `use-route-samples`; e2e/route-params.e2e.ts.
- 806681c упрощение функций (CC ≤ 8 у нового кода, кроме wheelScroll — встраивается в страницу текстом и должна быть одной функцией).
- 9ce5b49 merge master (PR #4 начал ту же правку мини-карты) — оставлена версия ветки + ariaLabel из master.

## Команды проверки

- `bun run typecheck` (apps/visualizer-spa) — чисто.
- `bun test src/flow/minimap.test.ts src/lib` — 170/170.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4311 PLAYWRIGHT_SKIP_WEBSERVER=1 bunx playwright test e2e/minimap.e2e.ts e2e/overlap.e2e.ts e2e/node-scroll.e2e.ts e2e/route-params.e2e.ts e2e/live-start.e2e.ts e2e/snapshot.e2e.ts` — 14/14.
- crapper --no-coverage / dryer по новым файлам — дублей нет.

## Не сделано

- Пусто по брифу. Вне брифа — см. 09-bugs (до этой задачи).
