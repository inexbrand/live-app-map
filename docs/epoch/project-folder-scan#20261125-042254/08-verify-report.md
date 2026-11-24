# Проверка

- `bun run scan -- --project ../korbor` → `{"screens":91,"byApp":{"miniapp":20,"admin":58,"site":13},"edges":123,"apiEdges":76,"routes":315,"tables":75,"warnings":[]}`.
- `bun test packages/cli/src/project` — 19 pass; `bun test scripts` — 12 pass + dev.test 2 pass.
- `bun test apps/visualizer-spa/src/lib/project …` — 10 pass (states перечитываются после правки файла).
- `bun test apps/visualizer-spa/src` (после перевода всех тестов на срезы) — 795 pass, 6 fail: шлюз «файл 600»
  (Windows, падал до работы), хуки замечаний ×4 и createSnapshotMiddleware — только в общем прогоне, одиночно
  `bun test …/lib/comments …/lib/snapshot` 28/28 (нагрузка соседних агентов); панель экрана ×3 (падала до работы) починил сосед в 060dea3.
- `bun test packages/mcp-server` — прежние падения вне зоны: describe_api undocumented (те же данные в старой карте — проверено
  на копии HEAD:maps/korbor-all), снимок tool-kit (stage у замечаний — чужая правка), visualizer state.
- tsc: apps/visualizer-spa (src + e2e), packages/cli, packages/mcp-server — чисто.
- Живой dev :4411 (`bun run dev -- --project ../korbor --port 4411`, шлюз 4412, трансляция 4413): `/maps/index.json` — первая
  запись `korbor` (91), `/__lam_project/map.json` 200 5 МБ, `/__lam_project/states` 200 `{"screens":{},"components":{}}`;
  headless Helium: «korbor · 91 экр.», группа «Мини-приложение 20», ошибок страницы нет. Сервер остановлен.
- После links: `bun run scan -- --project ../korbor` → 91 экран, 132 ребра (link 56, api 76) — как прежняя korbor-all; 9 рёбер config-link (10-я связь уже была в коде).
- `bun test packages/cli/src/project apps/visualizer-spa/src/lib/project` — 31 pass (links, /__lam_project/config, перечитывание config.ts).
- e2e (playwright) не запускались: только tsc e2e. Сценарий сравнения по коммиту git заменён на «файл против скана».
