/**
 * Вызовы API экранов через scanSource с entries: обход ссылок, JSX и хуков, предел глубины,
 * фабрики (своя обходится целиком, общая — только вызванные методы), методы по имени.
 */
import { describe, expect, test } from 'bun:test';
import { screenLines } from './test/scan-project';

/** Цепочка из n функций, последняя зовёт fetch. */
function chain(n: number): string {
  const hops = Array.from({ length: n - 1 }, (_, i) => `export function d${n}_${i + 1}() { return d${n}_${i + 2}(); }\n`);
  return `${hops.join('')}export function d${n}_${n}() { return fetch('/api/depth${n}'); }\n`;
}

describe('обход экрана', () => {
  test('объявления в файле экрана — без via; компонент → хук — via компонента', () => {
    const lines = screenLines(
      {
        'src/screen.tsx': `import { Widget } from './widget';
export function Screen() { return <Widget />; }
const loadVar = () => fetch('/api/var');
class Store { loadMethod() { return fetch('/api/method'); } }
const obj = { loadProp: () => fetch('/api/prop') };
function withParam(cb = () => fetch('/api/param')) { return cb; }
function loadFn() { return fetch('/api/fn'); }
`,
        'src/widget.tsx': "import { useData } from './hook';\nexport function Widget() { useData(); return null; }\n",
        'src/hook.ts': "export function useData() { return fetch('/api/hook'); }\n",
      },
      [{ file: 'apps/x/src/screen.tsx' }],
    );
    expect(lines).toEqual(['apps/x/src/screen.tsx: /api/hook via Widget, /api/var, /api/method, /api/prop, /api/param, /api/fn']);
  });

  test('глубина ссылок: 8 переходов — да, 9 — нет', () => {
    const lines = screenLines(
      {
        'src/chain.ts': [6, 7, 8, 9].map(chain).join(''),
        'src/s.tsx': "import { d6_1, d7_1, d8_1, d9_1 } from './chain';\nexport function S() { d6_1(); d7_1(); d8_1(); d9_1(); return null; }\n",
      },
      [{ file: 'apps/x/src/s.tsx' }],
    );
    expect(lines).toEqual(['apps/x/src/s.tsx: /api/depth6 via d6_1, /api/depth7 via d7_1, /api/depth8 via d8_1']);
  });
});

/**
 * n экранов сервиса; первые users импортируют стор страницы createPageStore (два метода с fetch).
 * Экран без своих вызовов — строка «файл: ».
 */
function storeScreens(n: number, users: number): string[] {
  const files: Record<string, string> = {
    'src/store.ts': "export function createPageStore() {\n  return { load: () => fetch('/api/load'), save: () => fetch('/api/save') };\n}\n",
  };
  for (let i = 1; i <= n; i++) {
    files[`src/p${i}.tsx`] = i <= users ? "import { createPageStore } from './store';\nexport function P() { createPageStore(); return null; }\n" : 'export function P() { return null; }\n';
  }
  return screenLines(files, Array.from({ length: n }, (_, i) => ({ file: `apps/x/src/p${i + 1}.tsx` }))).slice(0, users);
}

describe('порог своей фабрики: не больше max(2, экранов сервиса / 4)', () => {
  test('4 экрана, фабрику зовут 2 — своя у обоих', () => {
    expect(storeScreens(4, 2)).toEqual([
      'apps/x/src/p1.tsx: /api/load via createPageStore, /api/save via createPageStore',
      'apps/x/src/p2.tsx: /api/load via createPageStore, /api/save via createPageStore',
    ]);
  });

  test('12 экранов, зовут 3 — своя (порог 3); 11 экранов, зовут 3 — общая (порог 2)', () => {
    expect(storeScreens(12, 3).every((l) => l.endsWith('/api/load via createPageStore, /api/save via createPageStore'))).toBe(true);
    expect(storeScreens(11, 3)).toEqual(['apps/x/src/p1.tsx: ', 'apps/x/src/p2.tsx: ', 'apps/x/src/p3.tsx: ']);
  });
});

describe('что считается фабрикой и целью ссылки', () => {
  test('одна функция в объекте и объект во вложенной функции — не фабрика; объект-константа без вызова не обходится; declare без инициализатора', () => {
    const files: Record<string, string> = {
      'src/lib.ts': `export function getOne() {
  const inner = () => { return { a: () => 1, b: () => 2 }; };
  fetch('/api/one');
  return { value: inner, load: () => 1 };
}
export const handlers = { a: () => fetch('/api/handlers') };
export declare const ext: { load(): unknown };
`,
    };
    for (const n of [1, 2, 3, 4]) {
      files[`src/q${n}.tsx`] = "import { getOne, handlers, ext } from './lib';\nexport function Q() { getOne(); const h = handlers; ext.load(); return h; }\n";
    }
    const lines = screenLines(files, [1, 2, 3, 4].map((n) => ({ file: `apps/x/src/q${n}.tsx` })));
    expect(lines).toEqual([1, 2, 3, 4].map((n) => `apps/x/src/q${n}.tsx: /api/one via getOne`));
  });
});

describe('фабрики и методы по имени', () => {
  test('своя фабрика — целиком, общая (4 экрана из 4) — вызванный метод; метод по имени — если имя не больше чем у двух интерфейсов и сервис тот же', () => {
    const screen = (n: number, imports: string, body: string): string => `${imports}\nexport function S${n}() {\n${body}\n  return null;\n}\n`;
    const lines = screenLines(
      {
        'src/shared.ts': "export function createApi() {\n  return {\n    list: () => fetch('/api/list'),\n    item() { return fetch('/api/item'); },\n  };\n}\nexport function createPageStore() {\n  const load = () => fetch('/api/page-load');\n  return { load, save: () => fetch('/api/page-save') };\n}\ninterface Repo { load(): unknown; save(): unknown; }\ninterface Repo2 { save(): unknown; }\ninterface Repo3 { save(): unknown; }\nexport class HttpRepo implements Repo { load() { return fetch('/api/repo-load'); } save() { return fetch('/api/repo-save'); } }\nexport class HttpRepo2 implements Repo2 { save() { return fetch('/api/repo2-save'); } }\nexport class HttpRepo3 implements Repo3 { save() { return fetch('/api/repo3-save'); } }\n",
        '/apps/y/package.json': JSON.stringify({ name: '@fx/y' }),
        '/apps/y/src/repo.ts': "interface RepoY { load(): unknown; }\nexport class YRepo implements RepoY { load() { return fetch('/api/y-load'); } }\n",
        'src/s1.tsx': screen(1, "import { createApi, createPageStore } from './shared';", '  const api = createApi();\n  api.list();\n  createPageStore();'),
        'src/s2.tsx': screen(
          2,
          "import { useMemo } from 'react';\nimport { createApi, HttpRepo } from './shared';",
          '  createApi().item();\n  const repo = useMemo(() => new HttpRepo(), []);\n  repo.load();\n  repo.save();',
        ),
        'src/s3.tsx': screen(3, "import { createApi } from './shared';\nimport { S4 } from './s4';", '  createApi().item();\n  S4();'),
        'src/s4.tsx': screen(4, "import { createApi } from './shared';", "  createApi().item();\n  fetch('/api/s4-own');"),
      },
      [1, 2, 3, 4].map((n) => ({ file: `apps/x/src/s${n}.tsx` })),
    );
    expect(lines).toEqual([
      'apps/x/src/s1.tsx: /api/list via list, /api/page-load via createPageStore, /api/page-save via createPageStore',
      'apps/x/src/s2.tsx: /api/item via item, /api/repo-load via load',
      'apps/x/src/s3.tsx: /api/item via item',
      'apps/x/src/s4.tsx: /api/item via item, /api/s4-own',
    ]);
  });
});
