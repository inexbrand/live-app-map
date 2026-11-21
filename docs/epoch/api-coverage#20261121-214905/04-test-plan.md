# План проверки

- Фикстура `fixtures/source-monorepo`: `apps/admin` (конфиг-данные, switch, вкладки-приманка, алиас `@/`),
  miniapp: таб `tabRoute`, `Wallet` (стор в useMemo), общий клиент, чужой стор `orders-store`, DI через контекст,
  `Settings` (TanStack: файл страницы, loader в `tanstack-routes.tsx`, два маршрута на файл).
- `bun test packages/scanner-source packages/cli packages/graph packages/mcp-server`.
- Живые: `bun run scan:korbor`, CLI `scan --code-dir` для vpn-saas admin/miniapp; выборочная сверка экранов.
- e2e весь прогон против своего сервера (порт 4311), скриншоты вида «API» до (:4310, master) и после.
