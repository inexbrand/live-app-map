/**
 * Вычисление путей вызовов API: обёртки выражений, операторы, объекты, деструктуризация,
 * значения по умолчанию, возврат функций, Eden — через scanSource на временном проекте.
 */
import { describe, expect, test } from 'bun:test';
import { callLines, scan } from './test/scan-project';

describe('выражения пути', () => {
  test('скобки, as, !, satisfies, <T>, ??, ||, +, шаблон, enum, поле класса, объект и spread', () => {
    const code = scan({
      'src/a.ts': `declare const maybe: string | undefined;
declare const flag: boolean;
declare const other: object;
const BASE = '/api';
enum Paths { Users = '/api/users' }
class Cfg { static items = '/api/items'; }
const cfg = { orders: '/api/orders', nested: { p: '/api/nested' } };
const spread = { ...cfg, extra: '/api/extra' };
const mixed = { ...other, a: '/api/mixed' };
const shortPath = '/api/short';
const holder = { shortPath };
export async function run(id: string) {
  await fetch(('/api/paren'));
  await fetch('/api/as' as string);
  await fetch(maybe!);
  await fetch('/api/sat' satisfies string);
  await fetch(<string>'/api/assert');
  await fetch(maybe ?? '/api/fallback');
  await fetch(undefined || '/api/or');
  await fetch(flag && '/api/and');
  await fetch(BASE + '/x/' + id);
  await fetch(\`\${BASE}/tpl/\${id}\`);
  await fetch(Paths.Users);
  await fetch(Cfg.items);
  await fetch(cfg['orders']);
  await fetch(cfg.nested.p);
  await fetch(spread.extra);
  await fetch(spread.orders);
  await fetch(holder.shortPath);
  await fetch(mixed.a);
}
`,
    });
    expect(callLines(code)).toEqual([
      'GET /api/as fetch',
      'GET /api/assert fetch',
      'GET /api/extra fetch',
      'GET /api/fallback fetch',
      'GET /api/items fetch',
      'GET /api/mixed fetch',
      'GET /api/nested fetch',
      'GET /api/or fetch',
      'GET /api/orders fetch',
      'GET /api/orders fetch',
      'GET /api/paren fetch',
      'GET /api/sat fetch',
      'GET /api/short fetch',
      'GET /api/tpl/:id fetch',
      'GET /api/users fetch',
      'GET /api/x/:id fetch',
    ]);
  });

  test('цепочка констант: 7 шагов вычисляются, 8-й — уже за пределом глубины', () => {
    const code = scan({ 'src/deep.ts': "const k7_0 = '/api/deep7';\nconst k7_1 = k7_0;\nconst k7_2 = k7_1;\nconst k7_3 = k7_2;\nconst k7_4 = k7_3;\nconst k7_5 = k7_4;\nconst k7_6 = k7_5;\nconst k7_7 = k7_6;\nexport const go7 = () => fetch(k7_7);\n\nconst k8_0 = '/api/deep8';\nconst k8_1 = k8_0;\nconst k8_2 = k8_1;\nconst k8_3 = k8_2;\nconst k8_4 = k8_3;\nconst k8_5 = k8_4;\nconst k8_6 = k8_5;\nconst k8_7 = k8_6;\nconst k8_8 = k8_7;\nexport const go8 = () => fetch(k8_8);\n" });
    expect(callLines(code)).toEqual(['GET /api/deep7 fetch']);
  });

  test('деструктуризация константы: имя, переименование, значение по умолчанию; массив и вложенный шаблон не читаются', () => {
    const code = scan({
      'src/d.ts': `const cfg = { orders: '/api/orders', users: '/api/users' };
export async function run() {
  const { orders } = cfg;
  const { users: renamed } = cfg;
  const { missing = '/api/default' } = cfg as { missing?: string };
  const [first] = ['/api/arr'];
  const [second = '/api/arr-default'] = [] as string[];
  const { a: { b } = { b: '/api/nested-default' } } = {} as { a?: { b: string } };
  await fetch(orders);
  await fetch(renamed);
  await fetch(missing);
  await fetch(first);
  await fetch(second);
  await fetch(b);
}
`,
    });
    expect(callLines(code)).toEqual(['GET /api/default fetch', 'GET /api/orders fetch', 'GET /api/users fetch']);
  });
});

describe('функции проекта', () => {
  test('возврат: первый return тела (не вложенной функции), стрелка, метод объекта, приватный метод', () => {
    const code = scan({
      'src/f.ts': `function url() { const f = () => { return '/api/wrong'; }; return '/api/right'; }
function cond(x: boolean) { if (x) { return; } return '/api/after-empty'; }
function none() { return; }
function early(x: boolean) { if (x) { return '/api/early'; } return '/api/late'; }
const arrow = () => '/api/arrow';
const obj = { fn: () => '/api/objfn' };
class K { #u() { return '/api/private'; } run() { return fetch(this.#u()); } }
export function run() {
  fetch(url());
  fetch(cond(true));
  fetch(none());
  fetch(early(true));
  fetch(arrow());
  fetch(obj['fn']());
  return new K();
}
`,
    });
    expect(callLines(code)).toEqual(['GET /api/after-empty fetch', 'GET /api/arrow fetch', 'GET /api/early fetch', 'GET /api/private fetch', 'GET /api/right fetch']);
  });

  test('обёртка: значение параметра по умолчанию и деструктуризация объекта-аргумента', () => {
    const code = scan({
      'src/w.ts': `function get(path: string, method = 'POST') { return fetch(path, { method }); }
function send({ path: p, method }: { path: string; method: string }) { return fetch(p, { method }); }
export function run() {
  get('/api/get');
  send({ path: '/api/send', method: 'PATCH' });
  send('/api/str' as never);
}
`,
    });
    expect(callLines(code)).toEqual(['PATCH /api/send wrapper via send', 'POST /api/get wrapper via get']);
  });
});

describe('Eden', () => {
  test('шаг с аргументом: первое свойство объекта, имя переменной, без аргумента или имени — по тексту', () => {
    const code = scan({
      'src/e.ts': `import { treaty } from '@elysiajs/eden';
const api = treaty('http://localhost:3000');
declare const id: string;
declare const q: { slug: string };
declare const slug: string;
declare const extra: string;
export async function run() {
  await api.users({ id }).get();
  await api.posts(id).get();
  await api.items().get();
  await api.orders({}).get();
  await api.tags({ ...q }).get();
  await api.pairs({ slug, extra }).get();
}
`,
    });
    expect(callLines(code)).toEqual([
      'GET /items/:param eden',
      'GET /orders/:param eden',
      'GET /pairs/:slug eden',
      'GET /posts/:id eden',
      'GET /tags/:q eden',
      'GET /users/:id eden',
    ]);
  });
});

describe('объявления вне файла', () => {
  test('метод интерфейса — первая реализация; константа workspace-пакета по paths tsconfig', () => {
    const code = scan({
      'tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@fx/lib': ['../lib/src/index.ts'] } } }),
      '/apps/lib/package.json': JSON.stringify({ name: '@fx/lib' }),
      '/apps/lib/src/index.ts': "export const LIB_PATH = '/api/lib';\n",
      'src/i.ts': `import { LIB_PATH } from '@fx/lib';
interface Api { load(): string; }
class HttpApi implements Api { load() { return '/api/impl'; } }
class OtherApi implements Api { load() { return '/api/other'; } }
declare const api: Api;
export function run() {
  fetch(api.load());
  fetch(LIB_PATH);
  return [HttpApi, OtherApi];
}
`,
    });
    expect(callLines(code)).toEqual(['GET /api/impl fetch', 'GET /api/lib fetch']);
  });
});
