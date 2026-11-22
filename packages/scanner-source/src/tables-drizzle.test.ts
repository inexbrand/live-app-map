/**
 * Таблицы Drizzle через scanSource: фабрики, колонки-стрелка и объект, флаги цепочки, enum
 * (литерал, импорт, константа), ссылки, составные ключи, описания из комментариев и шапки файла.
 */
import { expect, test } from 'bun:test';
import { scan } from './test/scan-project';

const FILES = {
  "src/db/enums.ts": "export const ROLES = ['admin', 'user'] as const;\nexport const MIXED = ['a', 1];\n",
  "src/db/one.ts": "/**\n * Шапка файла.\n */\nimport { pgTable, uuid } from 'drizzle-orm/pg-core';\nexport const only = pgTable('only', { id: uuid('id').primaryKey() });\n",
  "src/db/two.ts": "/** Шапка двух. */\nimport { pgTable, uuid, text, integer, timestamp, varchar } from 'drizzle-orm/pg-core';\nimport { sql } from 'drizzle-orm';\nimport { ROLES, MIXED } from './enums';\ndeclare const schema: { table: typeof pgTable };\ndeclare const notTable: (n: string, c: unknown) => unknown;\nconst LOCAL = (['x', 'y']) satisfies string[];\nexport const users = pgTable('users', (t) => ({\n  id: uuid('id').primaryKey().defaultRandom(),\n  // имя\n  // вторая строка\n  name: text('full_name').notNull().unique(),\n  role: text('role', { enum: ROLES }).notNull(),\n  mixed: text({ enum: MIXED }),\n  local: varchar('local', { length: 3, enum: LOCAL }),\n  createdAt: timestamp('created_at').defaultNow(),\n  score: integer('score').default(sql`0`).$type<number>(),\n  plain: 'not a column',\n  bare: someCol,\n  'quoted': text('quoted'),\n  objEnum: text({ enum: ['p', 'q'] }),\n  noArgs: text(),\n}));\ndeclare const someCol: unknown;\n/** Заказы. */\nexport const orders = schema.table('orders', {\n  id: uuid('id'),\n  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),\n  other: uuid('other').references(() => ({ a: 1 })),\n  viaBlock: uuid('via_block').references(() => { return users.id; }),\n}, (t) => [primaryKey({ columns: [t.id, t.userId] }), foreignKey({ columns: [t.other, t.viaBlock, x], foreignColumns: [users.id, users.name] }), index('i').on(t.id), foreignKey({ columns: [t.id], foreignColumns: users.id })]);\ndeclare const primaryKey: (o: unknown) => unknown;\ndeclare const foreignKey: (o: unknown) => unknown;\ndeclare const index: (n: string) => { on: (...a: unknown[]) => unknown };\ndeclare const x: unknown;\nexport const fake = notTable('fake', { id: uuid('id') });\nexport const noName = pgTable(NAME, { id: uuid('id') });\ndeclare const NAME: string;\nexport const noCols = pgTable('nocols');\nexport const { a, b } = pgTable('destructured', { id: uuid('id') });\nexport let later;\nexport const objStyle = pgTable('obj', { id: uuid('id') }, { notArrow: true });\n"
};

test('таблицы и колонки', () => {
  expect(scan(FILES).tables).toEqual([
    {
      "orm": "drizzle",
      "name": "only",
      "exportName": "only",
      "location": {
        "file": "apps/x/src/db/one.ts",
        "line": 5
      },
      "columns": [
        {
          "name": "id",
          "type": "uuid",
          "primaryKey": true,
          "notNull": true
        }
      ],
      "doc": "Шапка файла.",
      "id": "table:drizzle:only",
      "serviceId": "service:@fx/x"
    },
    {
      "orm": "drizzle",
      "name": "users",
      "exportName": "users",
      "location": {
        "file": "apps/x/src/db/two.ts",
        "line": 8
      },
      "columns": [
        {
          "name": "id",
          "type": "uuid",
          "primaryKey": true,
          "notNull": true,
          "default": "gen_random_uuid()"
        },
        {
          "name": "name",
          "sqlName": "full_name",
          "type": "text",
          "notNull": true,
          "unique": true,
          "doc": "имя\nвторая строка"
        },
        {
          "name": "role",
          "type": "text",
          "notNull": true,
          "enumValues": [
            "admin",
            "user"
          ]
        },
        {
          "name": "mixed",
          "type": "text"
        },
        {
          "name": "local",
          "type": "varchar",
          "enumValues": [
            "x",
            "y"
          ]
        },
        {
          "name": "createdAt",
          "sqlName": "created_at",
          "type": "timestamp",
          "default": "now()"
        },
        {
          "name": "score",
          "type": "integer",
          "default": "0"
        },
        {
          "name": "quoted",
          "type": "text"
        },
        {
          "name": "objEnum",
          "type": "text",
          "enumValues": [
            "p",
            "q"
          ]
        },
        {
          "name": "noArgs",
          "type": "text"
        }
      ],
      "id": "table:drizzle:users",
      "serviceId": "service:@fx/x"
    },
    {
      "orm": "drizzle",
      "name": "orders",
      "exportName": "orders",
      "location": {
        "file": "apps/x/src/db/two.ts",
        "line": 26
      },
      "columns": [
        {
          "name": "id",
          "type": "uuid",
          "primaryKey": true,
          "notNull": true
        },
        {
          "name": "userId",
          "sqlName": "user_id",
          "type": "uuid",
          "references": {
            "table": "users",
            "column": "id",
            "onDelete": "cascade"
          },
          "primaryKey": true,
          "notNull": true
        },
        {
          "name": "other",
          "type": "uuid",
          "references": {
            "table": "users",
            "column": "id"
          }
        },
        {
          "name": "viaBlock",
          "sqlName": "via_block",
          "type": "uuid",
          "references": {
            "table": "users",
            "column": "name"
          }
        }
      ],
      "doc": "Заказы.",
      "id": "table:drizzle:orders",
      "serviceId": "service:@fx/x"
    },
    {
      "orm": "drizzle",
      "name": "obj",
      "exportName": "objStyle",
      "location": {
        "file": "apps/x/src/db/two.ts",
        "line": 42
      },
      "columns": [
        {
          "name": "id",
          "type": "uuid"
        }
      ],
      "id": "table:drizzle:objStyle",
      "serviceId": "service:@fx/x"
    }
  ]);
});
