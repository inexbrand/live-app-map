# Что сделано

## Изменения

Коммиты ветки Resterr1337/mutator-visualizer-spa-scanner:

- 2f2f340 test(scanner-source): выжившие мутанты вычислителя значений и роутов
- 6a03cff test(scanner-source): экраны, фабрики и реализации интерфейсов — выжившие мутанты
- 800f2cc test(scanner-source): схемы входа роутов — выжившие мутанты schema-type, schema-ast, route-input
- 99f985f test(scanner-source): выжившие мутанты db-calls, api-sinks, api-calls, route-access, rr-screens
- f7f1898 test(scanner-source): комментарии, таблицы, ответы и фабрики роутов — выжившие мутанты
- 67e6dde test(scanner-source): края скана — сервисы, символы, алиасы tsconfig, предел файлов, env
- a27fc30 test(visualizer-spa): граф документации — кадр canvas и геометрия камеры
- 1ccaf6f test(visualizer-spa): панель кода — роуты, таблицы, функции, вызовы экрана
- d2168e1 test(visualizer-spa): вид «Документация» — состояния списка, шапки эпохи, ссылок и локального графа
- 2093bdb test(visualizer-spa): шапка — вкладки, листы, бюджет экранов, крошки; убраны мёртвые запасные значения
- 0043030 test(visualizer-spa): карточка роута и вид «База данных» на собранных вручную данных
- 5781b9d test(visualizer-spa): палитра поиска — выбор строки, края стрелок, группы, подсказки

- scanner-source: тесты поведения на выживших — вычислитель значений, роуты и фабрики роутов, экраны React Router, реализации интерфейсов, схемы входа (TypeBox/zod), db-calls, клиенты API (fetch/axios/ky/eden, глубина обёрток 4 и 5), доступ роутов, комментарии, таблицы Drizzle/Prisma, ответы Elysia/Hono/Express, края скана (сервисы, символы 200/201, baseUrl/paths, предел файлов, env). Код: tables-prisma splitBlocks — лишняя проверка ветки; route-response — bodyOf вместо дублирования; services — JSDoc на месте. Эталон скана korbor/vpn-saas/fixtures до и после — совпадает.
- SPA: graph-draw (кадр canvas журналом команд, 14 сцен), graph-camera (новый модуль, 11 тестов), панель кода и StateInjectPanel, вид «Документация», шапка, карточка роута и «База данных», палитра поиска. Мёртвый код удалён (см. 06).

## Mutator: scanner-source (весь пакет, --mutate-all)

| | Убито | Выжило | Без покрытия |
|---|---|---|---|
| До | 983 | 501 | 12 |
| После | 1267 | 213 | 0 |

## Mutator: visualizer-spa (25 групп, --mutate-all)

| | Убито | Выжило | Без покрытия |
|---|---|---|---|
| До | 608 | 731 | 10 |
| После | 978 | 352 | 7 |

Мутантов «после» больше: новые тесты покрыли код, который до этого не мутировался, и новый файл graph-camera.ts.

| Файлы | Выжило до | Выжило после | Без покрытия до → после | Убито после |
|---|---|---|---|---|
| DocGraphCanvas.tsx, DocGraphView.tsx, KindMark.tsx, graph-draw.ts | 352 | 153 | 0 → 0 | 216 |
| BugMarks.tsx, DocPane.tsx, DocsView.tsx, Markdown.tsx, LocalGraph.tsx | 73 | 20 | 7 → 5 | 114 |
| CodePanel.tsx, ScreenApiItem.tsx, StateInjectPanel.tsx, code-parts.tsx | 52 | 14 | 0 → 0 | 66 |
| Breadcrumbs.tsx, MapToolbar.tsx, BudgetField.tsx, MapSelect.tsx, SettingsSheet.tsx, SourcesSheet.tsx, ThemeToggle.tsx, TlsProxyBlock.tsx, ViewTabs.tsx, use-dogfood-actors.ts, use-map-loader.ts | 66 | 32 | 1 → 0 | 110 |
| ApiRouteCard.tsx, ApiView.tsx | 37 | 4 | 0 → 0 | 58 |
| DatabaseView.tsx | 23 | 6 | 0 → 0 | 42 |
| CommandPalette.tsx | 15 | 4 | 0 → 0 | 41 |
| CommentComposer.tsx | 18 | 18 | 0 → 0 | 30 |
| CommentStatusBadge.tsx, CommentThreadItem.tsx, CommentsListPanel.tsx, ScreenCommentsPanel.tsx | 27 | 27 | 0 → 0 | 36 |
| CommentsToolbarButton.tsx | 3 | 3 | 0 → 0 | 3 |
| VoiceButton.tsx | 5 | 5 | 0 → 0 | 7 |
| start-comment.ts | 3 | 3 | 0 → 0 | 7 |
| ToolbarButton.tsx | 0 | 0 | 0 → 0 | 3 |
| VoiceModelDialog.tsx | 21 | 21 | 0 → 0 | 25 |
| CompareView.tsx | 14 | 14 | 0 → 0 | 59 |
| tls-check.ts | 1 | 1 | 0 → 0 | 12 |
| EdgeSheet.tsx | 0 | 0 | 0 → 0 | 1 |
| SessionProfilesPanel.tsx | 4 | 4 | 0 → 0 | 27 |
| map-adaptive.ts | 3 | 3 | 0 → 0 | 10 |
| view-tabs.ts | 0 | 0 | 0 → 0 | 1 |
| LamGrabHost.tsx, SnapshotOverlay.tsx | 6 | 6 | 0 → 0 | 18 |
| DiagnosticsDock.tsx | 7 | 7 | 0 → 0 | 14 |
| CommentMarkers.tsx | 0 | 0 | 0 → 0 | 0 |
| ShortcutsHelp.tsx | 1 | 1 | 2 → 2 | 0 |
| graph-camera.ts (новый файл) | — | 6 | — → 0 | 78 |

## Команды проверки

- mutator: `mutator --mutate-all --coverage-command "bun test --coverage --coverage-reporter=lcov <тесты группы>" --test-command "bun test <тесты группы>" <файлы>`; scanner-source — тесты ./packages/scanner-source.
- crapper: `crapper --coverage-command "bun test --max-concurrency=1 --coverage --coverage-reporter=lcov packages apps/visualizer-spa/src scripts" apps packages scripts`.
- dryer: `dryer` в корне.
- typecheck: `bun run typecheck`.
- e2e: свой vite на 4313 (шлюз 4323) с KORBOR_DIR и копией .lam-sessions, `PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:4313 bunx playwright test`.

## Не сделано

- Эквивалентные выжившие (352 в SPA, 213 в scanner-source) оставлены: ?./?? на непустых значениях, начальные значения, scrollIntoView, порядок уже упорядоченного. Больше всего осталось во взаимодействии DocGraphCanvas (мышь и симуляция d3 в happy-dom) — его проверяют e2e графа.
