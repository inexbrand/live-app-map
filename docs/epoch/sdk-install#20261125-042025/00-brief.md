# Brief — установка Live App Map в чужой проект

## Цель

Одна команда `curl -fsSL https://raw.githubusercontent.com/inexbrand/live-app-map/master/install.sh | bash` в корне проекта приложения ставит @live-app-map/sdk (tarball из GitHub Release), создаёт `.live-app-map/` (config.ts, states.ts), прячет map.json в .gitignore, кладёт скилл агента и клонирует Live App Map в ~/.live-app-map.

## Готово когда

- [ ] `packages/sdk`: `bun run pack` даёт live-app-map-sdk-<версия>.tgz с dist (js + d.ts); монорепо работает от src.
- [ ] `.github/workflows/release-sdk.yml`: тег sdk-v* → tarball → GitHub Release; синтаксис проверен actionlint.
- [ ] `live-app-map init` (packages/cli/src/init.ts) с тестами на настоящей ФС, идемпотентен.
- [ ] `install.sh` — тонкий загрузчик; проверен на временной копии проекта с локальным tarball (LAM_SDK_TARBALL).
- [ ] `skills/live-app-map/SKILL.md` — скилл заполнения states.ts/components.

## Вне scope

- Выпуск релиза и пуш тега (только с лидом).
- Код плагина lamVite и рантайма (зона sdk), загрузчик config.ts и --project (зона project).
