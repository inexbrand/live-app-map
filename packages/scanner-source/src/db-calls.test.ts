/**
 * Вызовы БД в обработчиках роутов через scanSource: циклы (N+1), формы Drizzle и Prisma,
 * заход в функции проекта (via, глубина 4, реализации интерфейса, повтор тела).
 */
import { describe, expect, test } from 'bun:test';
import type { CodeModel } from '@live-app-map/schema';
import { scan } from './test/scan-project';

/** Роуты с вызовами БД: «МЕТОД путь: orm операция таблица [via …] [loop] :строка, …». */
function dbLines(code: CodeModel): string[] {
  return code.routes.map(
    (r) => `${r.method} ${r.path}: ${r.dbCalls.map((c) => `${c.orm} ${c.operation} ${c.table}${c.via === undefined ? '' : ` via ${c.via}`}${c.inLoop === true ? ' loop' : ''} :${c.location.line}`).join(', ')}`,
  );
}

describe('Drizzle', () => {
  test('циклы, формы вызовов и функции проекта', () => {
    expect(dbLines(scan({ 'src/d.ts': "import { Elysia } from 'elysia';\nimport { pgTable, uuid } from 'drizzle-orm/pg-core';\ndeclare const db: any;\ndeclare const tx: any;\ndeclare const foo: any;\ndeclare const prisma: any;\ndeclare const cache: any;\ndeclare const list: string[];\nexport const users = pgTable('users', { id: uuid('id') });\nexport const posts = pgTable('posts', { id: uuid('id') });\ninterface Repo { getById(id: string): unknown; }\nclass PgRepo implements Repo { getById(id: string) { return db.select().from(posts); } }\ndeclare const repo: Repo;\ninterface Empty { load(): unknown; }\ndeclare const empty: Empty;\nfunction a1() { return a2(); }\nfunction a2() { return a3(); }\nfunction a3() { return a4(); }\nfunction a4() { db.delete(users); return a5(); }\nfunction a5() { return db.insert(posts); }\nfunction viaFn() { return db.update(users); }\nconst viaArrow = () => db.insert(users);\nconst viaExpr = function () { return db.delete(posts); };\nclass Svc { run() { return db.select().from(users); } }\nconst svc = new Svc();\nexport const app = new Elysia()\n  .get('/loops', async () => {\n    for (let i = await db.select().from(users); i < 3; i++) { await db.insert(posts); }\n    while (list.length) { await db.update(users); }\n    do { await db.delete(users); } while (list.length);\n    for (const x of await db.select().from(posts)) { await tx.update(users); }\n    for (const k in list) { await db.delete(posts); }\n    list.map(async () => db.insert(users));\n    list.forEach(function () { db.update(posts); });\n    list.then(() => db.delete(users));\n    list.map(viaArrow);\n  })\n  .get('/drizzle', async () => {\n    await db.selectDistinct().from(users);\n    Array.from(list);\n    await tx.update(unknownTable);\n    await foo.delete(unknownTable);\n    await foo.insert(users);\n    await db.insert(users, posts);\n    await db.query.users.findMany();\n    await db.query.posts.findFirst();\n    await db.query.users.findUnique();\n    await other.users.findMany();\n    await db.users.findMany();\n  })\n  .get('/callees', async () => {\n    a1();\n    viaFn();\n    viaFn();\n    viaArrow();\n    viaExpr();\n    svc.run();\n    repo.getById('1');\n    empty.load();\n    list.map(() => viaFn());\n  });\n" }))).toEqual([
      "GET /loops: drizzle select users :28, drizzle insert posts loop :28, drizzle update users loop :29, drizzle delete users loop :30, drizzle select posts :31, drizzle update users loop :31, drizzle delete posts loop :32, drizzle insert users loop :33, drizzle update posts loop :34, drizzle delete users :35",
      "GET /drizzle: drizzle select users :39, drizzle update unknownTable :41, drizzle insert users :43, drizzle select users :45, drizzle select posts :46",
      "GET /callees: drizzle delete users via a1 :19, drizzle update users via viaFn :21, drizzle insert users via viaArrow :22, drizzle delete posts via viaExpr :23, drizzle select users via run :24, drizzle select posts via Repo.getById :12, drizzle update users via viaFn loop :21"
    ]);
  });
});

describe('Prisma', () => {
  test('модели из schema.prisma: клиент db/prisma — да, cache — нет; неизвестная модель и операция — нет', () => {
    const code = scan({ 'src/p.ts': "import { Elysia } from 'elysia';\ndeclare const prisma: any; declare const db: any; declare const cache: any; declare const client: any;\nexport const app = new Elysia().get('/p', async () => {\n  await prisma.user.create();\n  await db.user.findMany();\n  await this.prisma.user.count();\n  await cache.user.findMany();\n  await prisma.order.create();\n  await prisma.user.unknownOp();\n  await prisma.findMany();\n});\n", 'prisma/schema.prisma': 'model User {\n  id String @id\n}\n' });
    expect(dbLines(code)).toEqual(["GET /p: prisma insert User :4, prisma select User :5, prisma count User :6"]);
  });

  test('без schema.prisma: модель по имени свойства, только у клиента с «prisma» в имени', () => {
    expect(dbLines(scan({ 'src/n.ts': "import { Elysia } from 'elysia';\ndeclare const prisma: any; declare const client: any; declare const myPrismaClient: any;\nexport const app = new Elysia().get('/n', async () => {\n  await prisma.order.create();\n  await client.order.create();\n  await myPrismaClient.order.delete();\n});\n" }))).toEqual(["GET /n: prisma insert order :4, prisma delete order :6"]);
  });
});
