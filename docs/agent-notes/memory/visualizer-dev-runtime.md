---
name: visualizer-dev-runtime
description: "live-app-map visualizer-spa — vite runs under Bun, dev endpoints, .lam-feedback exchange dir at monorepo root"
metadata:
  node_type: memory
  type: project
  originSessionId: 21462fd9-4823-4132-8f6f-06f4012e6749
  modified: 2026-11-20T13:41:28.434Z
---

Визуализатор (apps/visualizer-spa, :4310) запускается как `bun --bun vite`: vite.config импортирует workspace-пакеты, отданные как .ts, и Node-загрузчик конфига падает с ERR_MODULE_NOT_FOUND.
Dev-сервер отдаёт /maps/index.json (каталог из public/maps), POST /mcp (те же tools, что stdio `bun run mcp`), /api/agent-state, /api/error-reports, /__lam_proxy/https/<host:port>.
Обмен с агентом — файлы в `<корень монорепо>/.lam-feedback` (или $LAM_FEEDBACK_DIR), один писатель на файл.

**Why:** 2026-11-20 эти модули восстановлены с нуля (оригиналы не были закоммичены); поведение не очевидно из кода одного файла.
**How to apply:** e2e снимка требует флагов Chromium --auto-accept-this-tab-capture --use-fake-ui-for-media-stream (уже в playwright.config). Сканер исходников — область другого агента ([[scanner-source-owner]]).
