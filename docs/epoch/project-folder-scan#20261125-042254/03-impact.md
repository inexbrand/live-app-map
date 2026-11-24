# Влияние

- packages/cli: новая подпапка `src/project/`, команда `scan --project`, подпуть экспорта `./project-config`, зависимость `@live-app-map/sdk`.
- packages/scanner-source: поиск исходников экранов через path.resolve.
- apps/visualizer-spa: `lib/project/project-server.ts`, каталог без пресетов korbor, версии/скан карты проекта, vite.config.
- scripts: `dev.ts` (корневой `bun run dev`), `scan-korbor.ts` — обёртка; удалены korbor-enrich/code/site-pages, verify-korbor-maps.
- Удалены карты korbor (`maps/`, `public/maps/`) — 26 МБ; добавлены срезы `test-fixtures/maps` (~3 МБ).
- e2e: открывают `/__lam_project/map.json`; playwright задаёт `LAM_PROJECT=../korbor`.
- korbor: `.live-app-map/config.ts`, `.gitignore`.
- Сравнение по истории git для карты проекта не работает: map.json не в git (версий нет, свежий скан и файл — работают).
