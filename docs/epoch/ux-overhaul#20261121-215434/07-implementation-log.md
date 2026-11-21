# Что сделано

## Изменения

- `lib/nav-location.ts`, `lib/use-nav-history.ts` — состояние вида в адресе, «назад», F5.
- `components/Breadcrumbs.tsx` — крошки «вид › раздел › выбранное», кнопка «назад».
- `lib/global-search.ts`, `components/CommandPalette.tsx`, `lib/use-open-target.ts` — поиск ⌘K по экранам, роутам, таблицам, эпохам, документам, файлам кода и действиям.
- `lib/use-hotkeys.ts`, `components/ShortcutsHelp.tsx` — 1–4, G, T, /, ?, Esc.
- `lib/doc-graph.ts` — модель графа (эпохи, файлы эпох, заметки, руководства, роуты, таблицы, экраны, сервисы, файлы кода; рёбра «содержит», «ссылается», «принадлежит»), свёртка, фильтр, соседи, локальный граф, поиск.
- `components/graph/*` — canvas-граф (d3-force, камера, перетаскивание), боковая колонка фильтров, карточка узла, локальный граф у текста.
- `components/DocsView.tsx`, `Markdown.tsx` — режим «Граф», ссылки из открытых пунктов, `путь.md` в тексте открывает документ, «Ссылка» на документ.
- `components/DatabaseView.tsx` — описание в 4 строки, списки по 8, пустые состояния словами, без пустой полосы.
- `styles/global.css`, `views.css` — токены вместо зашитых цветов, светлая тема, без капса, шапка ноды, крошки.
- `lib/theme.ts`, `main.tsx` — тема до первого рендера.
- `flow/RevealSelected.tsx` — выбор экрана из поиска двигает холст к экрану.
- `lib/docs-view-model.ts` — `%` в ссылке документа больше не роняет вид (URIError).
- `e2e/ux-flows.e2e.ts` — сценарии владельца.

## Команды проверки

- `bun run typecheck` (apps/visualizer-spa) — чисто.
- `bun test src/lib` — 203 pass.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4311 PLAYWRIGHT_SKIP_WEBSERVER=1 bunx playwright test` — весь e2e (итог в 08).

## Не сделано

(пусто — см. 09-bugs: вне рамок задачи)
