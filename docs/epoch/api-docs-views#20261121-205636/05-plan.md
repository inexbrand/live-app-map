# План реализации

## Шаги

1. schema: `RouteInput`, `RouteAccess`, `DocsModel` + zod + convert; тесты.
2. scanner-source: вход и доступ роутов; тесты на фикстуре.
3. scanner-docs: новый пакет; тесты.
4. graph: api-query, docs-query; тесты.
5. cli/скрипты: docs по `--code-dir`, korbor, карта live-app-map, vpn-saas.
6. mcp: 4 инструмента; тесты.
7. visualizer: виды «API» и «Документация», эндпоинт картинок; обсуждение с design-expert; e2e.
8. Скриншоты, проверка вживую, PR.

## Файлы

- packages/schema/src/{code-model,code-model-zod,docs-model,docs-model-zod,types,zod,convert,index}.ts
- packages/scanner-source/src/{route-input,route-access,routes}.ts
- packages/scanner-docs/*
- packages/graph/src/{api-query,docs-query}.ts
- packages/mcp-server/src/{docs-tools,code-tools}.ts
- apps/visualizer-spa/src/components/{ApiView,DocsView,Markdown}.tsx, lib/{api-view-model,docs-view-model,docs-asset-middleware}.ts
