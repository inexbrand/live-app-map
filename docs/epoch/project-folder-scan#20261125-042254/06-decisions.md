# Решения

1. Роли — общий механизм: у каждого экрана приложения состояние на каждую роль из `config.apps[].roles`
   (вместо RECRUITER_PATHS). Точечные роли экрана — `LamScreenState.role` в states.ts (зона states).
2. Payload — общий адаптер (зависимость `payload` в package.json Next-приложения): экраны `/admin/login`,
   `/admin/collections`, страницы CMS из `/api/pages?locale=all`; not-found/layout catch-all убираются.
3. Примеры параметров — из шаблонов путей (`[id]`, `:id` → demo; `[...x]` → [demo]; `[[...x]]` → []),
   второй проход скана; реальные id подставляет визуализатор (sample-ids).
4. Карта проекта в каталоге — id = config.name, путь `/__lam_project/map.json`; в public/maps/index.json не пишется.
5. `/__lam_project/*` монтируется всегда: без проекта 404, а не index.html SPA.
6. states.ts перечитывается импортом `<путь>?v=<mtime>` (у file:// URL запрос кэш Bun не сбрасывает — проверено).
7. Срезы карт для тестов — `test-fixtures/maps` в корне (общие для spa и mcp-server), а не `fixtures/`
   (снимок scanner-source обходит все подпапки fixtures/). У miniapp и all — все роуты/таблицы (вид API
   выводит аудитории по данным), у all — вся документация (граф документов > 500 узлов).
8. Связи вне кода (табы, cross-links) — не зашиты в код; предложено поле `links` в контракт, ждёт лида.
