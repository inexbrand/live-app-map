# Test plan

- `bun test packages/schema packages/mcp-server apps/visualizer-spa/src` — точечно по пакетам.
- Middleware — реальный `node:http` сервер + `fetch`.
- build-map-catalog-fs — временная папка с картами.
- `bun run typecheck`.
- `bun run dev` + `curl :4310/maps/index.json`, `POST /mcp tools/list`.
- Playwright e2e `bun run test:e2e` + скриншоты пресетов.
