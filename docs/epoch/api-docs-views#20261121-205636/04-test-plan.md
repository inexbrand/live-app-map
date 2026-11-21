# План тестов

## Unit

- scanner-docs: `scanDocs(root)` на временном каталоге с эпохами разных форматов 09-bugs; и на живых
  репозиториях korbor, vpn-saas, live-app-map (числа эпох = числу папок).
- scanner-source: `scanSource` на фикстуре Elysia с `t.Object`, константой-схемой, zod, `requirePermission`,
  `viewer.role !== 'x'`, `.use(requirePermissionPlugin('p'))`.
- graph: `apiGroups`, `filterRoutes`, `epochList`, `searchDocs`, `docLinks` на карте, собранной реальными функциями.
- mcp-server: `callTool('list_epochs' | 'get_epoch' | 'search_docs' | 'describe_api')` на записанной карте.
- visualizer: модели видов (`api-view-model`, `docs-view-model`).

## E2E / frontend

- Playwright: карта korbor-all → «API» → фильтр метода, таблицы, «без описания» → роут → таблица → назад;
  «Документация» → эпоха → 09-bugs, картинка screens/ видна.
- Карта live-app-map → «Документация» → эпоха api-docs-views видна.

## Реальные вызовы

- `bun run scan:korbor`, скан live-app-map и vpn-saas через CLI `scan --code-dir`.
- `POST /mcp` на dev-сервере: `list_epochs`, `describe_api`.
