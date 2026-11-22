/**
 * Роуты Elysia, Hono, Express через scanSource на временном проекте: путь из литерала и констант,
 * префиксы приложений, монтирование роутеров, обработчик, описание из комментариев.
 */
import { describe, expect, test } from 'bun:test';
import type { CodeModel } from '@live-app-map/schema';
import { scan } from './test/scan-project';

/** Роуты строками «фреймворк МЕТОД путь [h=обработчик] :строка обработчика [doc=…]» по порядку файла. */
function routeLines(code: CodeModel): string[] {
  return code.routes.map((r) => `${r.framework} ${r.method} ${r.path}${r.handler.name === undefined ? '' : ` h=${r.handler.name}`} :${r.handler.location.line}${r.doc === undefined ? '' : ` doc=${r.doc}`}`);
}

describe('Elysia', () => {
  test('путь: литерал, корень, константа, поле объекта; не строка и неизвестное имя — роута нет', () => {
    const code = scan({
      'src/e.ts': `import { Elysia } from 'elysia';
const P = '/const';
const paths = { obj: '/obj' };
const NUM = 5;
declare const h: () => void;
declare function bodiless(): void;
const app = new Elysia;
const named = new Elysia({ name: 'svc', prefix: '/named' });
(app).get('/paren', () => 1);
app.get('/', () => 1);
app.get(P, () => 1);
app.get(paths.obj, () => 1);
app.get(NUM as never, () => 1);
app.get(UNDECLARED, () => 1);
named.get('/x', () => 1);
undeclaredApp.get('/y', () => 1);
app.get('/declared', h);
app.get('/bodiless', bodiless);
app.get('/unresolved', missingHandler);
app.get('/nohandler');
app.get(P);
app.register('/reg', (g: typeof app) => g.get('/inner', () => 1));
export function plain(a: typeof app) { a.get('/plain', () => 1); }
`,
    });
    expect(routeLines(code)).toEqual([
      'elysia GET /paren :9',
      'elysia GET / :10',
      'elysia GET /const :11',
      'elysia GET /obj :12',
      'elysia GET /named/x :15',
      'elysia GET /declared h=h :5',
      'elysia GET /bodiless h=bodiless :6',
      'elysia GET /unresolved h=missingHandler :19',
    ]);
  });

  test('описание: шапка файла у единственного роута, комментарий у вызова, JSDoc обработчика, шаги цепочки', () => {
    const code = scan({
      'src/one.ts': `/** Шапка файла */
import { Elysia } from 'elysia';

export const app = new Elysia().get('/one', () => 1);
`,
      'src/two.ts': `/** Шапка двух */
import { Elysia } from 'elysia';

export const app2 = new Elysia();
app2.get('/two-a', () => 1);
app2.get('/two-b', () => 1);
`,
      'src/site.ts': `import { Elysia } from 'elysia';
/** Документ обработчика */
function handler() { return 1; }
const app3 = new Elysia();
// Комментарий у вызова
app3.get('/site', handler);
app3.get('/handler-doc', handler);
`,
      'src/chain.ts': `import { Elysia } from 'elysia';
export const app4 = new Elysia()
  // Первый шаг
  .get('/chain-a', () => 1)
  // Второй шаг
  .get('/chain-b', () => 1);
`,
    });
    expect(routeLines(code).sort()).toEqual([
      'elysia GET /chain-a :4 doc=Первый шаг',
      'elysia GET /chain-b :6 doc=Второй шаг',
      'elysia GET /handler-doc h=handler :3 doc=Документ обработчика',
      'elysia GET /one :4 doc=Шапка файла',
      'elysia GET /site h=handler :3 doc=Комментарий у вызова',
      'elysia GET /two-a :5',
      'elysia GET /two-b :6',
    ]);
  });
});

describe('префиксы из констант', () => {
  test('prefix Elysia, group, basePath и монтирование Express — литерал, константа или поле объекта', () => {
    const code = scan({
      'src/p.ts': `import { Elysia } from 'elysia';
import { Hono } from 'hono';
import express from 'express';
const API = '/api';
const cfg = { v: '/v2' };
export const a = new Elysia({ prefix: API }).get('/e', () => 1);
export const b = new Elysia({ prefix: cfg.v }).get('/f', () => 1);
export const g = new Elysia().group(API, (app) => app.get('/g', () => 1));
export const h = new Hono().basePath(cfg.v).get('/h', (c) => c.json(1));
const x = express();
const r = express.Router();
r.get('/r', (q, s) => s.send(1));
x.use(API, r);
`,
    });
    expect(routeLines(code).sort()).toEqual([
      'elysia GET /api/e :6',
      'elysia GET /api/g :8',
      'elysia GET /v2/f :7',
      'express GET /api/r :12',
      'hono GET /v2/h :9',
    ]);
  });

  test('не Express: Router() чужого объекта, express.json(); use у Hono и неизвестного объекта не монтирует', () => {
    const code = scan({
      'src/n.ts': `import express from 'express';
import { Hono } from 'hono';
declare const other: { Router(): { get(p: string, h: unknown): void } };
const notRouter = other.Router();
notRouter.get('/other', () => 1);
const json = express.json();
json.get('/json', () => 1);
const hono = new Hono();
const r = express.Router();
r.get('/r', (q, s) => s.send(1));
hono.use('/h', r);
unknownThing.use('/u', r);
`,
    });
    expect(routeLines(code)).toEqual(['express GET /r :10']);
  });
});

describe('Express и Hono', () => {
  test('Router(), express.Router(); монтирование только use(литерал, имя) у приложения Express', () => {
    const code = scan({
      'src/x.ts': `import express, { Router } from 'express';
const app = express();
const r1 = Router();
const r2 = express.Router();
const r3 = express.Router();
r1.get('/a', (q, s) => s.send(1));
r2.get('/b', (q, s) => s.send(1));
r3.get('/c', (q, s) => s.send(1));
app.use('/v1', r1);
app.use(r2);
app.set('/v2', r2);
app.use('/v3', auth, routes.r3);
app.use(PREFIX_UNKNOWN, r3);
declare const auth: unknown;
declare const routes: { r3: typeof r3 };
`,
    });
    expect(routeLines(code)).toEqual(['express GET /v1/a :6', 'express GET /b :7', 'express GET /c :8']);
  });

  test('basePath Hono — литерал добавляет префикс, неизвестное имя — нет', () => {
    const code = scan({
      'src/h.ts': `import { Hono } from 'hono';
const app = new Hono().basePath('/api');
app.get('/x', (c) => c.json(1));
new Hono().basePath(PFX).get('/y', (c) => c.json(1));
`,
    });
    expect(routeLines(code)).toEqual(['hono GET /api/x :3', 'hono GET /y :4']);
  });
});
