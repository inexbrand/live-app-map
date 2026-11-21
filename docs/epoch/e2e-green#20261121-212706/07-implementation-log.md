# Implementation log

- Воспроизвёл 4 падения на своём сервере :4311 → скриншоты в test-results, причины в 02-research.
- Тулбар: `.toolbar__label`, `flex: none` у детей шапки, nowrap у счётчика, медиа-запрос < 1280 px. overlap 3/3.
- smoke/import-clear: `.react-flow__node-page`, хелпер `e2e/minimap-pages.ts`; класс `lam-minimap-page` в LamMiniMap.
- Каталог: тест красный (13 ≠ 33 и устаревший список карт) → `screenCount`.
- Первый полный прогон: route-params и node-scroll красные — нет профилей в worktree; сервер с `LAM_SESSIONS_DIR` → 21/21.
- Повторные прогоны: route-params плавает. Временный отладочный лог в шлюзе → 429 на обмене initData. Тест кэша красный → `createBearerCache`. Отладку убрал.
