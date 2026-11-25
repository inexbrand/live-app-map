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

## A — stream-browser (тиммейт)

| Шаг | Зачем | Коммит |
|---|---|---|
| Замер до: свой vite :4391 (LAM_GATEWAY_PORT 4392, LAM_STREAM_PORT 4393), карта korbor, первый кадр каждого экрана после перезапуска vite (measurements/measure-frames.mjs) | база | — |
| Опыт на настоящем Helium: spawn detached переживает выход bun; Browser.close() у connectOverCDP только отключается; exposeBinding на подхваченной вкладке работает (мост отвечает) | проверить, что подхват возможен | — |
| Тест stream-service.adopt.test.ts до кода — упал «нет модуля ./stream-browser» | TDD | a0c6b05 |
| lib/stream/stream-browser.ts: постоянный Helium (CDP :9341 или LAM_STREAM_CDP_PORT, профиль %LOCALAPPDATA%/live-app-map/stream-browser/<порт>), запуск отсоединённым процессом, connectOverCDP, stopStreamBrowser; флаги трансляции перенесены из gateway/snapshot-browser.ts | браузер и дисковый кэш живут после vite | a0c6b05 |
| StreamService: контекст по умолчанию (contexts()[0]), close() отключается, список вкладок владельца (stream-tabs.ts, targetId → ключ+адрес) | вкладки переживают перезапуск vite | a0c6b05 |
| stream-plugin: владелец vite-<порт> / preview-<порт> | два vite не трогают чужие вкладки | a0c6b05 |
| live-url.ts без cellOf: общий origin у экранов одного профиля и приложения; тест — два экрана одного приложения с одним origin | общий HTTP-кэш и кэш кода | a0c6b05 |
| bun run browser:stop (stream-browser-stop.ts), README и AGENTS.md | гасить браузер | a0c6b05 |
| Итог шагов состояния в списке вкладок: экран-состояние подхватывается без перехода, итог шагов приходит снова | 3 из 7 экранов korbor — состояния, без этого переходили заново | 125bb6a |
| Вкладки прошлого сервиса ждут 20 с (orphanGraceMs), а не закрываются первым набором (баг в 09) | первый набор карты — 1 экран из 7 | b85ed02 |

### Замер: перезапуск vite, карта korbor (7 экранов, 6 холстов в окне 1440×900)

| | первый кадр | 4 экрана | все 7 |
|---|---|---|---|
| До (браузер в процессе vite, ячейка на ноду), 2 прогона | 13,1 / 12,1 с | 13,9 / 16,5 с | 19,1 / 16,6 с |
| После, браузер жив, вкладки подхвачены, 3 прогона | 2,0 / 0,5 / 1,0 с | 2,2 / 0,9 / 1,6 с | 2,5 / 1,2 / 1,8 с |
| После, браузер погашен (browser:stop), дисковый кэш тёплый | 8,6 с | 8,7 с | 8,7 с |

### Команды проверки (A)

- `bun test src/lib/stream src/lib/gateway/snapshot-browser.test.ts src/store/app/live-url.test.ts` (apps/visualizer-spa) — 33 + 6 зелёных, вкладок-сирот тестов после прогона нет (curl :9341/json/list)
- `bun test src/lib/gateway src/lib/components-gallery src/store/app/live-url.test.ts` — 92 зелёных
- `bunx tsc --noEmit -p apps/visualizer-spa/tsconfig.json` — 0 ошибок
- `bun run browser:stop` — «погашен», повтор — «нет»

### Не сделано (A)

- e2e (playwright) не гонял: они подключаются к LAM_STREAM_CDP_PORT=9333, теперь это постоянный браузер со своим профилем — поведение должно совпасть, но не проверял.
- Общий :4310 не перезапускал — он на старом коде до перезапуска.

## Команды проверки

- `bun test` в packages/sdk — 37 зелёных (map-serve 6, sourcemap 3, vite 12, runtime и др.)
- `bun test src/lib/gateway/pick-script.bundle.test.ts src/lib/gateway/pick-script.test.ts src/lib/gateway/picker.test.ts` — 13 зелёных
- `bun x tsc --noEmit -p packages/sdk/tsconfig.json` — 0; tsc визуализатора по pick-* — 0
- korbor: tsc по scripts/dev-map-app.ts, dev-map-site.ts, dev.ts — 0

## Не сделано

- Полный стек korbor в режиме --map вместе с картой на :4310 не поднимал: dev-серверы korbor на 5175/16001/16002 заняты рабочей сессией, --map их гасит. Каждое приложение проверено на своём порту через шлюз карты (:4320).
