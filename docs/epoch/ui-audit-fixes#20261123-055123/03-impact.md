# Impact

Затронуто (apps/visualizer-spa):

- src/App.tsx, src/lib/use-hotkeys.ts, src/components/StateInjectPanel.tsx — панель экрана.
- src/flow/PageNode.tsx, page-node/NodeTop.tsx (новый), page-node/NodePath.tsx,
  src/flow/AppMapCanvas.tsx, styles/global.css — карточка, рёбра, обзор.
- src/components/MapToolbar.tsx, Breadcrumbs.tsx, toolbar/SettingsSheet.tsx,
  toolbar/LoginsSheet.tsx (новый), toolbar/SourcesSheet.tsx (удалён),
  toolbar/TlsProxyBlock.tsx, toolbar/use-map-loader.ts, SessionProfilesPanel.tsx — шапка, настройки, входы.
- src/lib/load-error.ts (новый), lib/load-map-preset.ts, lib/map-catalog.ts,
  store/app/map-slice.ts — ошибки загрузки.
- src/components/ApiView.tsx, ApiRouteCard.tsx, styles/views.css — API.
- src/components/DocsView.tsx, DocPane.tsx, BugMarks.tsx, DocsSourceLine.tsx (новый),
  graph/DocGraphView.tsx, lib/docs-view-model.ts, store/doc-graph-store.ts — документация.
- e2e: ui-audit-fixes.e2e.ts (новый), api-docs-views, ux-flows, docs-bugs.

Не трогали: схему карты, сканеры, шлюз, MCP.
