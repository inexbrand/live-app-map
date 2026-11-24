# Brief — sdk: плагин Vite, рантайм, вид «Компоненты»

## Цель

Пакет `@live-app-map/sdk`: dev-only плагин Vite `lamVite()` (apply: 'serve'), рантайм страницы
(подмена fetch/XHR по `lam_state`, `window.__LAM__.components()`), страница компонента
`/@lam/component?key=&variant=`; затем вкладка «Компоненты» в визуализаторе.

## Готово когда

- [ ] lamVite ищет `.live-app-map/states.ts` вверх от root, вставляет рантайм только в serve
- [ ] рантайм: lam_state из query/sessionStorage, GET /@lam/state, подмена fetch+XHR, 'pending'
- [ ] window.__LAM__.components(): имя, файл, рамка
- [ ] /@lam/component рендерит вариант с props, обёртка wrapper
- [ ] тесты на реальном createServer + build без строк рантайма
- [ ] живая проверка на korbor miniapp (без коммита в korbor)
- [ ] вкладка «Компоненты» в визуализаторе

## Вне scope

- релиз tarball (тиммейт install), states.ts korbor (агент по скиллу), шаги состояний (тиммейт states)
