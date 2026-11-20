# Brief

## Цель

Восстановить модули visualizer-spa, которые импортируются, но не были закоммичены (оригиналов нет ни в одном коммите), так чтобы `bun run typecheck` был зелёным, `bun run dev` поднимал визуализатор на :4310, а карты Korbor открывались.

## Готово когда

- [ ] typecheck зелёный во всех пакетах
- [ ] `bun run dev` поднимает :4310, `/maps/index.json` отдаёт каталог
- [ ] пресеты Korbor Miniapp / Admin / Site / Весь Korbor открываются (Playwright, скриншот)
- [ ] e2e `apps/visualizer-spa/e2e` проходят
- [ ] у каждого модуля тесты реального поведения
- [ ] PR в inexbrand/live-app-map, проверки зелёные

## Вне scope

- `packages/scanner-source` (другой агент)
- отправка error-reports по SMTP (нет зависимости, только запись на диск)
