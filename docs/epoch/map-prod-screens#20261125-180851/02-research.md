# Ресерч

Цифры до — docs/epoch/wasm-load-speed#20261125-171612/02-research.md («Дополнение»).

## Прод против dev-бандла (8 страниц админки, cache-exp.mjs)
| Сборка | Запросов | CPU, с |
|---|---|---|
| vite build (прод React) | 159 | 22,4 |
| NODE_ENV=development vite build (React dev, _debugStack есть) | 162 | 21,7 |
| dev-сервер | 4880+ | 42–48 |
Вывод: выигрыш даёт сборка в один бандл, а не прод-React. Собираем с NODE_ENV=development: остаются
import.meta.env.DEV-ветки korbor (WebDogfoodPicker, AuthBootstrap), _debugStack для пикера компонентов.

## Что ломает чистый прод
- `lamVite` (packages/sdk/src/vite.ts) — `apply: 'serve'`: в сборке нет рантайма карты, /@lam/state, /@lam/component.
- /@lam/component собирает модуль входа на лету через dev-сервер — в preview так нельзя.
- korbor miniapp: `import.meta.env.DEV` открывает вход dogfood (WebLoginGate.tsx:314).

## Устройство браузера трансляции
- `launchStreamBrowser` (lib/gateway/snapshot-browser.ts) — chromium.launch внутри vite; `StreamService.context` — newContext (кэш в памяти).
- Адрес экрана — `toGatewayUrl(…, cellOf(id))` (store/app/live-url.ts:56).
