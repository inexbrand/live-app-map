# Ресерч

## Как фронтенды ходят в API (только чтение)
- **korbor/admin**: объект-обёртка `api.get/post/patch(path, body)`, путь часто `${BASE}/…` с модульной константой BASE; сторы zustand.
- **korbor/miniapp**: `apiClient.request("/api/v1/…", { method: "POST" })` — метод класса.
- **korbor/mobile**: `client.request(api.messages(id, {}))` — билдеры запросов возвращают `{ path, method, schema }`.
- **korbor/site** (Next): прямой `fetch`.
- **vpn-saas/admin**: `apiFetch(schema, path, { method: HttpMethod.Post })` — обёртка над fetch, метод из enum, путь из функций-хелперов (`adminsApiPath(search)`); react-query `queryFn`.
- **vpn-saas/miniapp**: модули `src/ui/api/*.ts` с fetch.

Вывод: одних имён (`fetch`, `axios`) мало — нужен разбор обёрток: что функция проекта передаёт в fetch, какой параметр становится путём и откуда метод.

## Что есть в scanner-source
- Программа TS без node_modules (`noLib`), checker с раскрытием alias (`resolvedSymbol`), обход вызываемых функций до глубины 4 (`db-calls.ts`).
- Роуты с полными путями (`/api/v1/…/:id`), сервисы по package.json.
- Нода экрана: `source.file` от `project.root`; перевод в путь от `code.root` — `codeFileOfNode` (сейчас в SPA).

## Покрытие
| Нужно | Есть | Нет |
|---|---|---|
| fetch / axios / ky | — | всё |
| Eden treaty, Hono RPC (цепочки свойств) | — | всё |
| обёртки (функции, методы классов, объекты) | обход вызовов для БД | символьное вычисление аргументов |
| база из env (`import.meta.env`, `process.env`) | — | чтение .env* сервиса |
| экран → вызовы | символы файла экрана | граф вызовов/JSX от экрана |
| сопоставление с роутами | роуты | матчинг метод+путь |
| UI | панель кода сервиса/экрана | вызовы экрана, переход к роуту |
