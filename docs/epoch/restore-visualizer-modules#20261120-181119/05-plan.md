# Plan

1. schema: экспорт типов + convert viewport.
2. mcp-server: ядро (tools, rpc, lam-dir, agent-state), stdio поверх ядра.
3. map-catalog + build-map-catalog-fs + load-map-preset.
4. measure-iframe-height.
5. middleware: error-reports, agent-state, mcp.
6. snapshot: store + capture + SnapshotOverlay + LamGrabHost, FeedbackPanel на настоящий снимок.
7. Остатки typecheck SPA и тесты старой формы.
8. dev + Playwright + e2e, ревью, PR.
