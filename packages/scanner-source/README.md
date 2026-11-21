# `@live-app-map/scanner-source`

Сканер исходного кода на TypeScript compiler API. По каталогу (монорепо или один сервис) собирает раздел `code` карты (formatVersion 2).

## Что находит

| Сущность | Как |
|---|---|
| Сервисы | каталоги с `package.json`; файл принадлежит ближайшему |
| Символы | экспортируемые функции, React-компоненты (имя с заглавной в .tsx), классы, константы, интерфейсы, типы; JSDoc (`doc`), обычные комментарии (`comments`), строка, сигнатура |
| HTTP-роуты | Elysia (`new Elysia({ prefix })`, цепочки, `.group`), Hono (`new Hono()`, `basePath`), Express (`express()`, `Router()`, `app.use('/p', router)`); путь из литерала или const (в т. ч. импортированной) |
| Описание роута | комментарий у вызова → JSDoc именованного обработчика → комментарий верхнего оператора, если в нём один роут → шапка файла, если в файле один роут |
| Вызовы БД | Drizzle: `select().from(t)`, `db.insert/update/delete(t)`, `db.query.t.findMany`; Prisma: `prisma.model.findMany/create/…`. Ищутся в обработчике и в функциях проекта, которые он вызывает (глубина 4), включая методы интерфейсов: `repo.getById()` → реализации в фабриках `function create…(): Repo { return { … } }` и классах `implements Repo`. Найденное не в самом обработчике помечено `via` |
| Пути из фабрик | `.get(basePath)` внутри `createXPlugin({ basePath })` — путь вычисляется в каждом месте вызова фабрики |
| Вызовы API (`apiCalls`) | `fetch`, `axios` (+ `axios.create({ baseURL })`), `ky` (+ `prefixUrl`), Eden `treaty`, Hono `hc`; обёртки проекта (`apiFetch(path, { method })`, `api.get(path)`, `client.request({ path, method })`) — аргументы вычисляются через checker, база из `import.meta.env`/`process.env` берётся из `.env*` сервиса (только путь). Сопоставление с роутом: метод + сегменты пути (`routeId`) |
| Экраны (`screens`, при `entries`) | вызовы, достижимые из экрана по вызовам, JSX, ссылкам и сторам; Next — файл страницы, React Router — объект роута в конфиге (`element`/`Component`/`lazy`, в т. ч. `lazy: lazyRoute('id')` → карта загрузчиков → `import()`) |
| Таблицы | Drizzle `pgTable/mysqlTable/sqliteTable/schema.table` (колонки, имя в БД, JSDoc; одна таблица в файле без JSDoc берёт шапку файла); Prisma `model` из `*.prisma` (`@@map`, `@map`, `///`) |

Тесты, e2e и фикстуры (`*.test.*`, `*.spec.*`, `e2e/`, `fixtures/`) не сканируются. Импорты во внешние пакеты из `node_modules` не грузятся — программа строится только из файлов проекта.

## API

```ts
import { codeServiceNodes, scanSource } from '@live-app-map/scanner-source';

const { code, diagnostics, stats } = scanSource({
  root: '../korbor',
  // необязательно: экраны карты — для code.screens
  entries: [{ file: 'apps/miniapp/src/app/routes-config.tsx', nodeId: 'route:/feed', routePath: '/feed' }],
});
const serviceNodes = codeServiceNodes(code); // ноды kind: 'service' для карты
```

## Чего нет

- динамический сегмент вызова не сопоставляется с литералом роута (`/api/v1/${surface}/…` остаётся без роута);
- экраны RR без элемента в конфиге (`element: null`, рендер табов в шелле) и конфиги без компонентов — без вызовов;
- WebSocket, GraphQL;
- префиксы, навешанные в другом файле (`app.use(plugin)` с `prefix` у родителя);
- gRPC и прочие транспорты, кроме HTTP.