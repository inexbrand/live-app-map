# Research

- mutator (TypeScript): покрытие — `--coverage-command "bun test --coverage --coverage-reporter=lcov <тесты>"` (пишет coverage/lcov.info), прогон мутанта — `--test-command`. Метрики — .metrics/mutate, рабочие копии — target/mutation-workers.
- scanner-source: 1496 точек мутаций (mutator --scan). Тесты пакета: api-calls, api-match, route-*, scan-cases (временные проекты), scan-snapshot (снимок скана fixtures/), scan-source, tables-prisma.
- Компоненты SPA: 1441 точка. DOM-тесты (happy-dom + Testing Library, src/test/dom.ts) лежат рядом: ApiView, CompareView, DatabaseView, DocsView, EdgeSheet, SessionProfilesPanel, StateInjectPanel, dock-nav, shell, snapshot, comments/*, graph/DocGraphView, toolbar/MapToolbar, flow/canvas, app.test.
- Прошлый проход (07 crap-under-10): список выживших не сохранился (scratchpad другой сессии) — прогоняю заново.
