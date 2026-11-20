# План тестов

Фикстура `fixtures/source-monorepo` дополняется фронтендами: `apps/web` (Next-подобные экраны с fetch, axios, ky, обёрткой-объектом `api.get`, функцией-обёрткой с enum-методом и билдером запроса), `apps/miniapp` (Vite: Eden treaty, Hono RPC, базовый URL из `import.meta.env` и `.env`).

- scanner-source: `scanSource` на фикстуре → ожидаемые пары (метод, путь, клиент, routeId) для каждого вида клиента; несопоставленный вызов без routeId; обёртки не дают ложных вызовов (`/api/:path`); экран получает вызовы из хука/стора/дочернего компонента.
- schema: `codeFileOfNode` (перенос, существующие тесты), zod принимает новые поля.
- cli: `bin.ts scan --code-dir` на фикстуре → рёбра api экран → сервис; `bin.ts code` печатает apiCalls/matched.
- spa: `selectNodeCode` для экрана — вызовы с роутом и таблицами, несопоставленные отдельно.
- Живьём: korbor и vpn-saas (`bin.ts code`) — числа; Playwright на dev :4310 — панель экрана и переход к роуту.
