---
name: korbor-map-cabinet-not-miniapp
description: "На карте korbor нужен кабинет apps/miniapp в браузере (1440×900), не вид Telegram-мини-приложения; apps/mobile не нужен"
metadata:
  node_type: memory
  type: project
  originSessionId: 71d01c9e-4924-435d-8fae-1e6f9ae2e835
  modified: 2026-11-25T08:31:26.997Z
---

2026-11-25 пользователь: «мини апп не нужен» — на карте Live App Map korbor показывать **кабинет рекрутера и заказчика в браузере**: это тот же `apps/miniapp` вне Telegram (https://vite.localhost:5175, слева тёмная панель «Нужные люди — в нужных командах», справа вход). Окно экранов 1440×900 — поле `viewport` приложения в `korbor/.live-app-map/config.ts` (sdk ≥ 0.1.1), группа подписана «Кабинет». Админка и сайт — тоже 1440×900.
Одного размера мало: шлюз входит через данные Telegram (lam_init_data), и miniapp рисует вид telegram (рельс слева). Кабинет (верхнее меню korbor) — только с `?surface=web`: поле `query: { surface: 'web' }` приложения в config.ts (sdk ≥ 0.1.2). Пользователь заметил по скриншоту: «почему мини апп там».
`bun add -d <url tarball>` в korbor дописывал ключ sdk повторно — после обновления смотреть apps/miniapp/package.json на дубли.
`apps/mobile` (Tauri, :1420) — другое приложение для телефона, пользователь его не просил; стек экранов без адресов.

**Why:** я сначала принял `apps/mobile` за «новое приложение» и открыл не то — пользователь показал скриншот кабинета.
**How to apply:** спорный «какое приложение» — сравнить скриншот пользователя со снимками кандидатов на его ширине окна, прежде чем менять карту. См. [[project-folder-map]], [[korbor-local-run]].
