# Решения

1. Tarball собирается во временной папке с отдельным package.json (exports на dist), а package.json пакета в монорепо остаётся на src. Причина: npm pack не умеет publishConfig.exports, а монорепо и тесты должны работать от исходников.
2. Точки входа берутся из exports пакета (./src/*.ts) — сборка следует за тем, что добавляет тиммейт sdk, без правки pack.ts. Внешние — dependencies и peerDependencies (vite).
3. install.sh — тонкий загрузчик: клон/pull в $LAM_HOME, bun install, `bun run <lam>/packages/cli/src/bin.ts init`. Вся логика в init.ts (тестируется). Клон нужен до init, поэтому он первым шагом.
4. baseUrl — только из числового литерала server.port в блоке server vite.config; https — если в конфиге basicSsl/https. Порт из переменной/env не угадывается: пустая строка + комментарий + строка «впишите baseUrl» в выводе (правило «нет зашитых запасных значений»). В korbor так получится для admin/call/miniapp.
5. Идемпотентность: config.ts/states.ts создаются только если их нет; строка .gitignore — только если нет; sdk переставляется только при другом spec (сравнение без разницы в слешах); скилл перезаписывается — это наш файл, обновление желаемо.
6. Последний релиз — GitHub API /releases, первый не-черновик и не-пререлиз с тегом sdk-v* и файлом live-app-map-sdk-*.tgz. Релиза нет — ошибка с подсказкой про --tarball / LAM_SDK_TARBALL, выдуманный URL не подставляется.
7. vite.config приложений init не правит: у korbor это функции с условиями, автоматическая правка рискованна. Вместо этого — шаг в выводе.
8. Next-приложения (apps/*/next.config) в config не попадают и перечисляются в выводе: lamVite только для Vite.
9. MCP для агента проекта в скилле: `claude mcp add live-app-map -- bun run --silent --cwd <lam> mcp` — cwd = клон, чтобы .lam-feedback совпадал с визуализатором; --silent, чтобы строка «$ bun run …» не мешала stdio.
