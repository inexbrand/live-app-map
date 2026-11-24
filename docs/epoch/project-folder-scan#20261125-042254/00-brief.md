# Brief

## Цель

Проект как папка `.live-app-map` в приложении: скан по `config.ts` в один `map.json`, визуализатор
открывает карту проекта (`--project` / `LAM_PROJECT`) и отдаёт `states.ts` по `GET /__lam_project/states`;
карты korbor уезжают из репозитория live-app-map.

## Готово когда

- [x] `bun run scan -- --project ../korbor` пишет `korbor/.live-app-map/map.json`: 91 экран (20/58/13), группы miniapp/admin/site, 76 рёбер api
- [x] `korbor/.live-app-map/config.ts` и строка map.json в .gitignore korbor — коммит 94abea96
- [x] визуализатор `bun run dev -- --project ../korbor --port 4411`: каталог «korbor · 91 экр.», карта на холсте
- [x] `GET /__lam_project/states` отвечает (200 `{screens, components}`; без проекта 404)
- [x] `maps/korbor-*`, `public/maps/korbor-*` удалены, тесты на срезах `test-fixtures/maps`
- [x] README, AGENTS.md
- [x] связи, которых нет в коде — `config.links` (3795579), в korbor 10 связей; рёбер 132 (link 56, api 76), как было
- [x] `GET /__lam_project/config` — LamProjectConfig для вкладки «Компоненты» (sdk)

## Вне scope

- Контракт `packages/sdk/src/project.ts` (меняет лид).
- Узлы-состояния, шаги, `lam_state` (тиммейт states), install.sh/init (install).
