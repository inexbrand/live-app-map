# Влияние на остальной код

## Зависимый код

| Символ | Файл | Почему заденет |
|---|---|---|
| `ApiRoute` | schema/code-model.ts | новые необязательные поля; zod `.strict()` — без правки схемы старые карты читаются, новые падали бы |
| `AppMapDocument`/`LiveAppMapDocument` | schema/types.ts, convert.ts | новый раздел `docs` должен переходить через convert в обе стороны |
| `collectRoutes` | scanner-source/routes.ts | добавляются вход и доступ; id и порядок роутов не меняются |
| `withSourceCode` | cli/code-scan.ts | добавляет docs |
| `AppView` | visualizer view-store | новые значения 'api', 'docs' |
| MapToolbar | visualizer | кнопки видов; файл > 25 КБ — правка через cat/write |
| CodePanel/DatabaseView | visualizer | переход к роуту в вид «API» |

## Риски

- Размер карты: vpn-saas + 4,6 МБ текста. Приемлемо (korbor-all уже 3,6 МБ), строки дёшевы для zod.
- Картинки не в карте — нужен dev-сервер; без него вместо картинки подпись.
- Эвристика ролей может ошибаться: в UI подпись «найдено в коде», показываем имена функций-проверок.
- Пересечение с задачей 7: MapToolbar/global.css/app-store — правки только в своих местах (кнопки видов, новые классы).
