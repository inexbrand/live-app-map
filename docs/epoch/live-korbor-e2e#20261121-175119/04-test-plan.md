# Test plan

Реальные вызовы, без моков тестируемого:

- `bun test apps/visualizer-spa/src/lib/gateway` — куки, хост шлюза, сервер шлюза на
  настоящем HTTP, dogfood, профиль, статус страницы, форма, снимки на настоящем Chromium.
- `bun test apps/visualizer-spa/src/flow` — раскладка всех карт × 5 масштабов, revealShift.
- `bun test apps/visualizer-spa/src/lib/db-view-model.test.ts` — на korbor-all.
- `bun test packages/scanner-react-router` — TanStack на исходниках в памяти + интеграция RR.
- Playwright `e2e/overlap.e2e.ts` — панели и выбранная нода на 3 размерах окна.
- Живые Playwright-скрипты на korbor: экраны под профилями, админка без профиля и с ним,
  «целиком» туда-обратно, вид БД; замеры памяти и FPS (`measurements/*.ts`).
- Скан vpn-saas только чтением, сверка git status до и после.
