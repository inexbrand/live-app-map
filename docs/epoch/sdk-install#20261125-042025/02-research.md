# Ресерч

- `packages/sdk/package.json`: exports "." → ./src/index.ts, сборки нет. `src/project.ts` — типы контракта (LamProjectConfig, LamScreenStates, LamComponentFixtures, LamStep).
- `packages/cli/src/commands.ts`: таблица COMMANDS (Map имя → Command(argv, io)), runCli, USAGE. bin.ts — запуск через bun. Команды init нет.
- `.github/` в репо нет — workflow первый.
- Скилла в репо нет (`skills/` нет).
- Реальный проект korbor: apps/{admin,call,miniapp,mobile,site,...}/vite.config.ts. Порт: в mobile литерал `port: 1420`; в admin/call/miniapp — `port: callPort` из env с запасным значением → статически порт не известен честно, baseUrl остаётся пустым с подсказкой.
- bun 1.4.0, gh есть, actionlint нет (проверка через docker-образ rhysd/actionlint).

## Покрытие (что установка должна покрыть)

| Нужно | Было | Делаю |
|---|---|---|
| tarball sdk | нет | scripts/pack.ts |
| релиз по тегу | нет | release-sdk.yml |
| init .live-app-map | нет | init.ts |
| скилл в проект | нет | SKILL.md + копия init |
| клон LAM | нет | install.sh |
| подключение lamVite в vite.config | — | только подсказка в выводе (править чужой vite.config автоматически рискованно: у korbor конфиг-функция с условиями) |
