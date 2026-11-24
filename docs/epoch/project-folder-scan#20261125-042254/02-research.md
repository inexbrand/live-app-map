# Ресерч

- `scripts/scan-korbor.ts` — сканировал 3 поверхности, писал 4 карты в `maps/` и зеркало в `public/maps`;
  korbor-специфика — `scripts/korbor-enrich.ts` (ROLE_STATES по путям, TAB_ORDER, страницы Payload, cross-links),
  `korbor-site-pages.ts` (CMS `/api/pages?locale=ru`), `korbor-code.ts` (один скан исходников).
- `packages/cli/src/index.ts#runScan`, `code-scan.ts#attachCode/screenEntries` — общий скан.
- Визуализатор: `vite.config.ts` (каталог `mapsIndexMiddleware`, версии `mapVersionsMiddleware` + `monorepoScanRecipes`),
  `src/lib/map-catalog.ts` (пресеты `korbor-presets.ts`), `src/test/fixtures.ts` (тесты читали public/maps/korbor-*).
- Тесты, читавшие карты korbor напрямую: ~20 unit (spa), 2 mcp-server, 13 e2e.

## Найдено по ходу

- `packages/scanner-source/src/scan-source.ts#ScreenRoots`: на Windows экраны не находились (ключ — ts fileName
  с `/`, поиск — path.join с `\`) → `code.screens = 0`, нет рёбер api. Исправлено (коммит 8c141ce).
- Payload без `locale` отдаёт title пустым (поле локализовано) → `locale=all` и первый непустой перевод.

## Покрытие

| Что | Было | Стало |
|-----|------|-------|
| Экраны korbor | 91 (20/58/13) | 91 (20/58/13) |
| Рёбра api | 76 | 76 |
| Рёбра link | 56 | 47 — нет табов (7), «лента → вакансия» (1), сайт → корни (2); ждёт `links` |
| Роли | по зашитым путям (RECRUITER_PATHS) | у каждого экрана приложения все роли из config |
| id экранов сайта | site:site-home, site:site-cms:about | site:route:/[[...slug]], site:cms:/about, site:payload:/admin/login |
