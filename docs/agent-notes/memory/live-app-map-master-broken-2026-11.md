---
name: live-app-map-master-broken-2026-11
description: На 2026-11-20 master live-app-map не собирается — 9 файлов visualizer-spa не закоммичены; их чинит отдельный агент
metadata:
  node_type: memory
  type: project
  originSessionId: c9b94e2a-f151-48db-8d58-b15c0c33920a
  modified: 2026-11-20T13:32:56.748Z
---

На 2026-11-20 `master` (5fcebf8) inexbrand/live-app-map: `bun run dev` падает, typecheck красный — `vite.config.ts`, `App.tsx`, `MapToolbar.tsx`, `PageNode.tsx` импортируют 9 файлов, которых нет в git (map-catalog, load-map-preset, measure-iframe-height, LamGrabHost, SnapshotOverlay, 4 vite-middleware). Восстанавливает другой агент в ветке `Resterr1337/visualizer-spa-task-fix`. Ещё: холст высотой 0 (у `.app-main` нет CSS).

**Why:** живую проверку визуализатора без этих файлов не сделать.

**How to apply:** перед проверкой UI посмотреть, влита ли та ветка; если нет — временный worktree в scratchpad + харнесс-конфиг Vite с заглушками (не коммитить). Связано: [[korbor-vpn-db-via-ports]].
