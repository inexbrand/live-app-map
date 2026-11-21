# Что сделано

## Изменения

- schema: `ApiRoute.input` (body/query/params/headers из Elysia `t.` и zod), `ApiRoute.access` (auth, roles, permissions, checks); новый раздел `docs` (DocsModel, DocEpoch с readiness и openBugs) в обоих форматах, конверт переносит его.
- scanner-docs (новый пакет): `scanDocs(root)` — эпохи, заметки, руководства, картинки эпох.
- scanner-source: `route-input.ts`, `route-access.ts`; на korbor вход у 187 из 314 роутов, доступ у 295.
- graph: `api-query.ts` (группы, фильтры, покрытие), `docs-query.ts` (список эпох, поиск, индекс ссылок документ → роут/таблица/экран/файл).
- cli: `code`/`scan --code-dir` кладут `docs`; карты korbor пересобраны с docs; карта live-app-map.
- mcp-server: `list_epochs`, `get_epoch`, `search_docs`, `describe_api`; `get_route`/`list_routes` отдают вход и доступ.
- visualizer-spa: виды «API» и «Документация», markdown (react-markdown + remark-gfm), dev-эндпоинт картинок, роуты в «Базе данных» кликабельны, кнопки видов в шапке.
- README: виды и MCP-инструменты.

## Журнал действий

- Ресерч: что есть по API в визуализаторе (02-research) — роуты только в панели сервиса, docs нет вовсе.
- TDD по пакетам: тест на фикстуре и живых репо → реализация → typecheck пакета.
- design-expert: дал шкалу и раскладку (06-decisions) — вёрстка по ней.
- Первый e2e упал: после перехода к таблице и назад фильтры «API» сбрасывались → вынес фильтры в view-store, добавил проверку в e2e.
- Глазами по скриншотам: убрал лишний верхний отступ 72 px, длинный JSDoc в карточке свёрнут до первого абзаца, права — тегами вместо капс-бейджей.

## Команды проверки

- `bun test packages/schema` — 44 pass; `bun test packages/scanner-docs` — 6 pass (включая живые korbor, vpn-saas, live-app-map).
- `bun test packages/scanner-source` — 36 pass; `bun test packages/graph/src/api-docs-query.test.ts` — 22 pass.
- `bun test packages/cli/src/code-scan.test.ts` — 5 pass; `bun test packages/mcp-server` — 14 pass.
- `bun test apps/visualizer-spa/src/lib/api-docs-view-model.test.ts` — 9 pass; `docs-asset-middleware.test.ts` — 2 pass.
- `bun test scripts/verify-korbor-maps.test.ts` — 8 pass.
- `bunx tsc --noEmit -p apps/visualizer-spa/tsconfig.json` — чисто.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4312 PLAYWRIGHT_SKIP_WEBSERVER=1 LAM_SHOTS_DIR=<epoch>/screens bunx playwright test e2e/api-docs-views.e2e.ts` — 4 pass.

## Не сделано

(пусто)
