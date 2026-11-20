# Verify report (2026-11-20)

- `bun run typecheck` — зелёный во всех workspaces.
- `bun test --max-concurrency=1 apps/visualizer-spa/src packages/schema packages/mcp-server` — 214 pass, 0 fail.
- `bun run dev` → :4310; `/maps/index.json` — 4 карты (Весь Korbor 80, Мини-приложение 16, Админка 29, Сайт 35); `POST /mcp tools/list` — 7 tools; `GET /api/agent-state` — ok.
- `bun run build` (vite под Bun) — собирается; node:-модули в бандл не попали.
- Playwright `bun x playwright test` — 5 passed (smoke ×2, import-clear, snapshot ×2); `--repeat-each 2` — 10 passed.
- Живая проверка: брошенная ошибка и rejected promise в Chromium → `.lam-feedback/error-reports.jsonl` и консоль dev.
- Скриншоты пресетов: `screens/` (dev-серверы Korbor не запущены — кадры iframe белые, карта и ноды отрисованы).

Не проверено: живые iframe с запущенным Korbor (нет его dev-серверов в этом окружении); Reassure-перф-тест (в репо нет jest/RTL-инфраструктуры).
