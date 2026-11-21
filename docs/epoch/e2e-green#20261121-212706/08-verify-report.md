# Verify report

| Проверка | Результат |
|---|---|
| `bunx playwright test` (apps/visualizer-spa, живой korbor, сервер :4311 с LAM_SESSIONS_DIR) — 3 прогона подряд | 21 passed ×3 (14.6 с, 15.0 с, 21.4 с), 0 failed |
| До правки кэша Bearer | 1 failed (route-params) в 3 из 5 прогонов — 429 |
| `bun run typecheck` (все workspaces) | exit 0 |
| `bun test apps/visualizer-spa` | 276 pass, 0 fail |

Скриншоты после правки (`screenshots/`):

- overlap-1024x700.png — шапка в одну строку (вкладки вида иконками), панели не наезжают на зум и мини-карту.
- smoke-first-screen-390x844.png — выбран первый экран, полоса 390×844.
- site-map-13-screens.png — «Сайт · 13 экр.» (было 33 с сервисами).
- import-miniapp.png, import-cleared.png — импорт файла и очистка.

Lint-скрипта в репо нет.
