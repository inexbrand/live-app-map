---
name: lam-dev-auth-autologin
description: "Автовход визуализатора через @live-app-map/dev-auth — где код, копия в korbor, что нужно в базе korbor"
metadata:
  node_type: memory
  type: project
  originSessionId: a29e1f25-91b1-41ef-8592-902a7bd0f8c8
  modified: 2026-11-24T23:01:28.680Z
---

С 2026-11-23 профили входа шлюза заводятся сами: `useGatewayFrames` при открытии карты шлёт `POST /__lam_sessions/auto`, шлюз спрашивает `<origin экрана>/api/lam-dev-auth/roles` и выдаёт сессии (пакет `packages/dev-auth`). В korbor обработчик — дословная копия `protocol.ts`/`server.ts` в `apps/api/src/modules/dev/lam-dev-auth/` (пакет не опубликован, `file:`-зависимость ломает CI korbor), роли — `lam-dev-auth-plugin.ts`.

Параметры маршрутов (sample-ids) у профиля автовхода читаются через `<origin фронтенда>/api` с куками роли; истёкшая кука доступа (15 мин) — вход выдаётся заново.

**Why:** правка протокола в одном месте без второго ломает автовход молча (роли отфильтруются клиентом).

**How to apply:** меняешь `packages/dev-auth/src/{protocol,server}.ts` — копируй их в korbor без изменений. На пустой базе korbor роли падают с «нет активного админа / пользователя роли»: админ — `bun run --filter @korbor/db seed:admin` (ADMIN_BOOTSTRAP_*), пользователи — вход мини-аппа + choose-role через API; у пользователя без телефона мини-апп откроет регистрацию. Middleware шлюза грузится при старте vite — после правки `lib/gateway/*` перезапусти dev-сервер. См. [[visualizer-dev-runtime]], [[korbor-local-run]].
