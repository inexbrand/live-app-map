# 08 — проверка

- `bun test flow/canvas.test.tsx flow/api-domain-graph.test.ts flow/canvas-layout.test.ts` — 44 pass, 0 fail.
- `bunx tsc --noEmit -p apps/visualizer-spa` — без ошибок.
- Живо: vite :4391 с LAM_PROJECT=korbor, Helium headless через playwright-core: на холсте 48 карточек доменов (activity, admins, …, auth), у auth «роуты 31 экраны 12»; рёбер в DOM до выбора 56 (навигация), после клика по auth — 68 (+12 = экраны auth). Ошибок страницы нет.
- Не проверено глазом: при общем виде пунктир тоньше пикселя, на скриншоте линий не видно — проверено счётом рёбер в DOM.
