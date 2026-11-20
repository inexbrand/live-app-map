# 07 — Журнал

- 2026-11-20 — разбор (этап А): запуск, тесты, typecheck, сканы korbor. Итог в 02-research. Коммит d539bb2.
- Вопрос координатору про 9 отсутствующих файлов; ответ — модули делает другой агент.
- schema v2: `code-model.ts`, `code-model-zod.ts`, `upgrade.ts`; тест красный → зелёный; фикстуры тестов пакетов на formatVersion 2. Коммит 94bfaa5.
- scanner-source: фикстура `fixtures/source-monorepo` (Elysia, Hono, Express, Drizzle, Prisma, React) → 12 тестов красные → реализация → 12 зелёных. Скан korbor: 260 роутов, но БД лишь у 34 — причина: порты-репозитории. Добавлены `implementations.ts` (тест на фикстуре с интерфейсом) → 221 из 260. Описание таблицы из шапки файла. Коммит 27343b9.
- CLI: `code`, `scan --code-dir`, `writeMapFile`, `CodeModel.root`. Коммит ef35eff.
- Визуализатор: `node-code` (тест на реальном скане фикстуры), `ServiceNode`, `CodePanel`, `canvas-graph` вынесен из `AppMapCanvas` (тот тянет `PageNode` с отсутствующим модулем). Коммит d53b39c.
- Живая проверка: временный worktree в scratchpad = моя ветка + `origin/Resterr1337/visualizer-spa-task-fix` (конфликт в `schema/index.ts` — обе правки экспортов, сведено), но модулей SPA там ещё нет → харнесс-конфиг Vite с заглушками 5 модулей только в scratchpad, порт 4311. Найдено: холст высотой 0 (старая вёрстка, не моя) — в харнессе подставлен CSS; панель замечаний показывала у сервиса URL экрана → починено (987c446).
- `inLoop` у вызовов БД: тест на фикстуре с for и .map → реализация. Коммит babae8c.
