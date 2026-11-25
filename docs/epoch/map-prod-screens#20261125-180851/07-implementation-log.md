# Что сделано

## B — сборка приложений для карты (основная сессия)

| Шаг | Зачем | Коммит |
|---|---|---|
| Замер dev-бандла против прода (admin, 8 страниц) | понять, нужен ли прод-React | — (02-research) |
| Тест packages/sdk/test/map-serve.test.ts до кода — упал «нет модуля» | TDD | 2b9d462 |
| serveMapApp (packages/sdk/src/map-serve.ts): vite build --watch + preview, номер сборки, скрипт перезагрузки | собранный бандл вместо dev-сервера | 2b9d462 |
| lamVite в сборке и preview: рантайм в HTML, /@lam/state через runnerImport, страница компонентов отдельным входом | состояния и компоненты карты на бандле | 2b9d462 |
| Плагины фикстуры сначала были общими у build и preview → пересборка падала (configResolved preview перетирал состояние) — inline стал функцией | у сборки и preview свои экземпляры плагинов | 2b9d462 |
| components() отдавал [] — сжатие переименовало функции → minify: false; файл был assets/*.js → sourcemap в странице, пропуск кадров из node_modules | дерево компонентов и пикер на бандле | 2b9d462 |
| Разбор sourcemap перенесён из pick-source.ts визуализатора в sdk runtime/sourcemap.ts, mapFrame берёт файл исходника для бандла | одна реализация для пикера и SDK | 2b9d462 |
| SDK 0.1.3, релиз sdk-v0.1.3 (tgz) | korbor ставит SDK из релиза | 8a0dac3 |
| korbor: scripts/dev-map-app.ts, scripts/dev-map-site.ts, флаг --map в scripts/dev.ts, distDir из NEXT_DIST_DIR, sdk 0.1.3 | запуск korbor для карты | korbor ab4736d |

## Команды проверки

- `bun test` в packages/sdk — 37 зелёных (map-serve 6, sourcemap 3, vite 12, runtime и др.)
- `bun test src/lib/gateway/pick-script.bundle.test.ts src/lib/gateway/pick-script.test.ts src/lib/gateway/picker.test.ts` — 13 зелёных
- `bun x tsc --noEmit -p packages/sdk/tsconfig.json` — 0; tsc визуализатора по pick-* — 0
- korbor: tsc по scripts/dev-map-app.ts, dev-map-site.ts, dev.ts — 0

## Не сделано

- Полный стек korbor в режиме --map вместе с картой на :4310 не поднимал: dev-серверы korbor на 5175/16001/16002 заняты рабочей сессией, --map их гасит. Каждое приложение проверено на своём порту через шлюз карты (:4320).
