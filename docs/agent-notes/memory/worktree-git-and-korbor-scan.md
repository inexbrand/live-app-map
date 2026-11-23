---
name: worktree-git-and-korbor-scan
description: "в worktree live-app-map звать /usr/bin/git (rtk портит вывод), scan:korbor только с KORBOR_DIR"
metadata:
  node_type: memory
  type: project
  originSessionId: 3dc5ca61-e3de-4e73-b711-4ae4a846fbe0
  modified: 2026-11-23T00:49:23.982Z
---

- rtk-обёртка искажает вывод git (stash list, status) — в скриптах звать `/usr/bin/git`. Голый stash не использовать: стек общий с другими worktree.
- `bun run scan:korbor` из worktree ищет korbor в `../korbor` — запускать с `KORBOR_DIR=/Users/macbook/orca/korbor`.
- Карты `*.generated.liveappmap.json` (например vpn-saas) — локальные, в .gitignore, verify-korbor-maps их пропускает.
- Виды «API» и «Документация» (PR #6, 2026-11-21): docs в карте только при скане с `--code-dir`; картинки эпох отдаёт dev-эндпоинт `/__lam_docs/asset`.

- e2e визуализатора из worktree: свой сервер (`LAM_GATEWAY_PORT=4321 bun --bun vite --port 4311`) с `LAM_SESSIONS_DIR` на копию `/Users/macbook/orca/live-app-map/.lam-sessions` — без профилей route-params и node-scroll красные.
- Холст рисует только видимые ноды (onlyRenderVisibleElements): число экранов в e2e считать по мини-карте (`.lam-minimap-page`), не по `.react-flow__node`.
- korbor отвечает 429 на частый `/api/v1/auth/telegram/miniapp`: Bearer мини-аппа кэшируется в шлюзе (PR #7, 2026-11-21); плавающий route-params — сначала искать 429.

- Порт 4311 может держать соседний worktree (octopus) — хук prevent-duplicate-dev блокирует запуск; брать свободную пару (4312/4322).
- Сообщение коммита с обратными кавычками через `-m` теряет текст (подстановка shell) — писать в файл и `git commit -F`.

- compare.e2e «коммит против свежего скана» зовёт scan-korbor через dev-сервер: dev-сервер worktree запускать с `KORBOR_DIR=/Users/macbook/orca/korbor`, иначе скан падает и тест ждёт до таймаута.
- Unit-тесты с сокетами (middleware, шлюз) в песочнице Claude Code падают — гонять с отключённой песочницей. Общий прогон `bun test packages apps/... scripts` ломался утечкой мока fetch из packages/react (починено 2026-11-22).

- Проверка в основном checkout /Users/macbook/orca/live-app-map после слияния: dev-сервер тоже с LAM_SESSIONS_DIR на копию профилей, иначе route-params и node-scroll красные. compare.e2e однажды упал под нагрузкой полного прогона («Было» осталось disk — список коммитов не успел за 15 с); одиночно 6/6, повтор полного — 35/35 (2026-11-22).

- Ветка в снимке gitStatus в начале сессии Orca может быть чужой (показал Resterr1337/sander, а была design-expert-task-…): перед push смотреть `/usr/bin/git status -sb` и пушить `HEAD` в свою ветку, иначе рождается лишняя удалённая ветка (2026-11-23).
- `ls` тоже обёрнут rtk и добавляет размер к имени файла — в скриптах `/bin/ls -1`.

**Why:** на этом потеряно время в задачах api-docs-views и e2e-green.
**How to apply:** перед git- и scan-командами в worktree live-app-map. См. [[visualizer-dev-runtime]].