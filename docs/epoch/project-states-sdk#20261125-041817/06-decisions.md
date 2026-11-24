# Решения и контракт (общий для тиммейтов)

Контракт типов — `packages/sdk/src/project.ts` (менять только через лида).

1. Папка проекта `<проект>/.live-app-map/`: `config.ts` (`export const config`), `states.ts` (`export const screens`, `export const components`), `map.json` (скан, в .gitignore). Других файлов нет.
2. Библиотека `@live-app-map/sdk`: типы + dev-only плагин Vite `lamVite()` (`apply: 'serve'`) — в production-сборку не попадает ничего. Рантайм плагина: подмена API по `?lam_state=<экран>/<состояние>` (или вариант компонента), дерево компонентов страницы (`window.__LAM__`), страница отдельного компонента `/@lam/component?key=<файл#экспорт>&variant=<id>`.
3. Состояния интерфейса — шаги (`LamStep`), выполняет браузер трансляции визуализатора после загрузки страницы. Хуков в коде приложения нет (иначе след в production).
4. Компоненты — отдельная карта «Компоненты» (галерея, как Storybook): узел на вариант, рендер через страницу компонента. Storybook в korbor нет — своё лёгкое решение.
5. Распространение: публичный репозиторий; релиз GitHub (тег `sdk-v*`) с tarball `@live-app-map/sdk`; `install.sh` из raw.githubusercontent ставит tarball, создаёт `.live-app-map/`, добавляет `map.json` в .gitignore, кладёт скилл в `.claude/skills/live-app-map/` проекта.
6. Карта korbor переезжает в `korbor/.live-app-map/`; `maps/korbor-*` и `public/maps/korbor-*` удаляются; визуализатор открывает проект: `bun run dev -- --project ../korbor` / `LAM_PROJECT`.

## Зоны тиммейтов (файлы не пересекаются)

- project — CLI/скан по config.ts → map.json, визуализатор `--project`, каталог, выдача states.ts визуализатору, переезд карт korbor, config.ts korbor.
- sdk — packages/sdk: плагин Vite, рантайм (API, дерево компонентов, страница компонента), тесты; затем вид «Компоненты» в визуализаторе.
- states — визуализатор: состояния экрана узлами рядом с экраном, роль, `lam_state`, шаги в StreamService, схема state.
- install — install.sh, workflow релиза sdk, команда init, SKILL.md.
- demo-data — korbor: сид демо-данных (вакансии, отклики, сделки, чаты) для состояния «с данными».
