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
| Таблицы | Drizzle `pgTable/mysqlTable/sqliteTable/schema.table` (колонки, имя в БД, JSDoc; одна таблица в файле без JSDoc берёт шапку файла); Prisma `model` из `*.prisma` (`@@map`, `@map`, `///`) |

Тесты, e2e и фикстуры (`*.test.*`, `*.spec.*`, `e2e/`, `fixtures/`) не сканируются. Импорты во внешние пакеты из `node_modules` не грузятся — программа строится только из файлов проекта.

## API

```ts
import { codeServiceNodes, scanSource } from '@live-app-map/scanner-source';

const { code, diagnostics, stats } = scanSource({ root: '../korbor' });
const serviceNodes = codeServiceNodes(code); // ноды kind: 'service' для карты
```

## Чего нет

- связь экран → роут API (fetch-вызовы клиентов);
- префиксы, навешанные в другом файле (`app.use(plugin)` с `prefix` у родителя);
- gRPC и прочие транспорты, кроме HTTP.
