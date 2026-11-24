---
name: helium-browser-mcp
description: "Основной браузер — Helium; MCP chrome-devtools-mcp на нём: helium (autoConnect) и helium-agent (свой профиль)"
metadata:
  node_type: memory
  type: user
  modified: 2026-11-24T12:17:22.246Z
  originSessionId: f757e4b2-22ea-4772-bc19-f10da4e0a6de
---

С 2026-11-24 основной браузер пользователя — Helium (Chromium 158, `%LOCALAPPDATA%\imput\Helium`). Браузерная работа агента — через него. Подключены MCP (user scope): `helium-agent` — chrome-devtools-mcp запускает свой Helium с профилем `%LOCALAPPDATA%\chrome-devtools-mcp\helium-profile` и `--acceptInsecureCerts` (vite.localhost); `helium` — `--autoConnect --userDataDir <Helium User Data>` к открытому Helium пользователя, требует включённого chrome://inspect/#remote-debugging. Оба проверены 2026-11-24 (страница korbor мини-аппа открылась, UA Chrome/158).

**Why:** пользователь попросил всё делать нативно через Helium.
**How to apply:** для UI-проверок — инструменты `helium-agent`; нужны входы пользователя — `helium`. playwright-core — с executablePath Helium. Правило — `~/.claude/rules/dev-resources.md`. См. [[korbor-local-run]].
