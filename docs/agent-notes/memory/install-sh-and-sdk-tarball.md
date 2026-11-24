---
name: install-sh-and-sdk-tarball
description: "Как устроены install.sh, init и сборка tarball sdk; грабли проверки на Windows"
metadata:
  node_type: memory
  type: project
  originSessionId: 71d01c9e-4924-435d-8fae-1e6f9ae2e835
  modified: 2026-11-24T23:32:38.363Z
---

install.sh — тонкий загрузчик (клон в LAM_HOME, bun install, `bin.ts init`); логика в packages/cli/src/init.ts. Tarball sdk — packages/sdk/scripts/pack.ts: точки из exports (./src/*.ts) → dist, package.json для публикации пишется во временной папке; package.json пакета в монорепо остаётся на src.

**Why:** 2026-11-25 тиммейт sdk перезаписал package.json целиком и стёр скрипт pack:tarball; клон в длинном пути scratchpad не ставится (bun ENAMETOOLONG); scratchpad общий с другими агентами — файлы сообщений коммитов называть уникально.
**How to apply:** проверять install.sh в %TEMP%\lam-e2e с LAM_SDK_TARBALL и LAM_REPO_URL=/c/work/live-app-map; после чужих правок sdk/package.json проверять, что pack:tarball на месте. tar с путём C:\ не работает — запускать в cwd. См. [[shared-checkout-no-stash]].
