# Ресерч

## Как было

- `apps/visualizer-spa`: свой UI-kit `src/ui` (Button, Chip, Badge, Input, Select на `<select>`, Field, Panel, EmptyView) и около 66 КБ своего CSS (`src/styles/global.css`, `views.css`). shadcn, Tailwind и Radix/Base UI не стояли.
- Шапка `components/MapToolbar.tsx`: карта, вкладки видов, хлебные крошки (`Breadcrumbs.tsx`), кнопка темы (`toolbar/ThemeToggle.tsx`), отдельная плавающая панель «Логи и статус» (`DiagnosticsDock.tsx`).
- Вид «API» `components/ApiView.tsx`: дерево сервис → раздел → модуль из `apiArchitecture` (`packages/graph/src/api-query.ts`), карточка роута `ApiRouteCard.tsx` в узкой колонке.
- Данные роута уже есть в карте (`packages/schema/src/code-model.ts`): `ApiRoute.input` (params/query/body/headers), `access`, `response`, `dbCalls`; колонки таблиц — `DbTable.columns`; экраны — `CodeIndex.callersByRoute`.

## Покрытие запроса пользователя

| Пункт | Было | Стало |
|---|---|---|
| Убрать «Логи и статус» | плавающая панель | статус и лог — в панели экрана (`ScreenStatusLog`) |
| Убрать хлебные крошки | есть | удалены |
| Тема в «Настройки» | кнопка в шапке | ToggleGroup в листе настроек |
| Поиск по центру | справа | по центру шапки |
| Все контролы на shadcn | свой kit, нативные select | shadcn (Base UI, nova), `src/ui` удалён |
| Входы автоматически | ручной вход | пакет `dev-auth` + шлюз (тиммейт auth-mate) |
| API: без сервисов, по доменам | сервис → раздел → модуль | домены (`apiDomains`) |
| Доска роута | узкая карточка | доска: вход, ответ, доступ, БД с колонками, что меняет, экраны, код |
| Свежий korbor, все поверхности | — | dev.ts `--without`, api/site/admin/miniapp 200 |

## Домены korbor (замер на `maps/korbor-all.liveappmap.json`, 314 роутов)

Первый сегмент после `/api/v1` — это часто аудитория (admin 141, recruiter 47, employer 44), а не предмет. Общие модули с другими разделами: admin — 10, recruiter — 9, employer — 6, auth — 1, internal — 1. Порог «2+ общих модуля» отделяет аудитории от доменов.
