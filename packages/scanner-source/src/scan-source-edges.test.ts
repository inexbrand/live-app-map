/**
 * Края скана: сервисы монорепо (имя, корень), порядок символов, обрезка сигнатуры,
 * алиасы tsconfig (baseUrl, paths), счётчики нод сервисов, предел файлов, база URL из env.
 */
import { expect, test } from 'bun:test';
import { basePathOf } from './env-files';
import { codeServiceNodes, scanSource } from './index';
import { writeProject } from './test/scan-project';

const FILES = {
  "/package.json": "{\"name\":\"mono\",\"private\":true,\"workspaces\":[\"apps/*\"]}",
  "/root.ts": "export const rootConst = 1;\n",
  "/tsconfig.json": "{\"compilerOptions\":{\"baseUrl\":\".\"}}",
  "/apps/y/package.json": "{\"private\":true}",
  "/apps/y/src/b.ts": "export function second(p: string) { return fetch(p); }\nexport function first() { return 1; }\n",
  "/apps/y/src/a.ts": "import { second } from 'src/b';\nexport const useIt = () => second('/api/base-url');\n",
  "/apps/z/package.json": "{\"name\":\"\"}",
  "/apps/z/tsconfig.json": "{\"compilerOptions\":{\"paths\":{\"@z/*\":[\"./src/*\"]}}}",
  "/apps/z/src/sig.ts": "import { helper } from '@z/helper';\nimport { Elysia } from 'elysia';\nexport function long(p0: string, p1: string, p2: string, p3: string, p4: string, p5: string, p6: string, p7: string, p8: string, p9: string, p10: string, p11: string, p12: string, p13: string) { return helper('/api/paths'); }\nexport function exact(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: 1) {}\nexport function over(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: 1) {}\nexport function Short(x: number): string { return String(x); }\nexport const app = new Elysia().get('/z', () => 1);\n",
  "/apps/z/src/helper.ts": "export function helper(p: string) { return fetch(p); }\n",
  "src/c.ts": "export const c = 1;\n",
  "/apps/y/src/t.ts": "import { pgTable, uuid } from 'drizzle-orm/pg-core';\nexport const t = pgTable('t', { id: uuid('id') });\n",
  "/apps/y/tsconfig.json": "{\"compilerOptions\":{\"baseUrl\":\".\"}}",
  "/apps/x/package.json": "{\"name\":\"@fx/x\"}"
};

test('сервисы, символы, вызовы через алиасы и ноды сервисов', () => {
  const { code } = scanSource({ root: writeProject(FILES) });
  expect({
    services: code.services.map((s) => `${s.id} ${s.root}`),
    symbols: code.symbols.map((s) => `${s.location.file}:${s.location.line} ${s.name} ${(s.signature ?? '').length} ${(s.signature ?? '').slice(-3)}`),
    nodes: codeServiceNodes(code).map((n) => `${n.id} ${JSON.stringify(n.metadata)}`),
    calls: (code.apiCalls ?? []).map((c) => `${c.method} ${c.path} ${c.via ?? ''}`),
  }).toEqual({
    "services": [
      "service:@fx/x apps/x",
      "service:apps/y apps/y",
      "service:apps/z apps/z",
      "service:mono ."
    ],
    "symbols": [
      "apps/x/src/c.ts:1 c 0 ",
      "apps/y/src/a.ts:2 useIt 2 ()",
      "apps/y/src/b.ts:1 second 11 ng)",
      "apps/y/src/b.ts:2 first 2 ()",
      "apps/y/src/t.ts:2 t 0 ",
      "apps/z/src/helper.ts:1 helper 11 ng)",
      "apps/z/src/sig.ts:3 long 172 ng)",
      "apps/z/src/sig.ts:4 exact 200  1)",
      "apps/z/src/sig.ts:5 over 200 : …",
      "apps/z/src/sig.ts:6 Short 21 ing",
      "apps/z/src/sig.ts:7 app 0 ",
      "root.ts:1 rootConst 0 "
    ],
    "nodes": [
      "service:@fx/x {\"routes\":0,\"tables\":0,\"symbols\":1}",
      "service:apps/y {\"routes\":0,\"tables\":1,\"symbols\":4}",
      "service:apps/z {\"routes\":1,\"tables\":0,\"symbols\":6}",
      "service:mono {\"routes\":0,\"tables\":0,\"symbols\":1}"
    ],
    "calls": [
      "GET /api/base-url second",
      "GET /api/paths helper"
    ]
  });
});

test('предел файлов: ровно столько — без предупреждения, на один меньше — предупреждение', () => {
  const root = writeProject(FILES);
  const files = scanSource({ root }).stats.files;
  expect(scanSource({ root, maxFiles: files }).diagnostics).toEqual([]);
  expect(scanSource({ root, maxFiles: files - 1 }).diagnostics.map((d) => d.message)).toEqual([`Исходников ${files}, разобрано первые ${files - 1}`]);
});

test('база URL из значения env: только путь, без origin, query и хвостового слэша', () => {
  const cases: Array<[string, string | null]> = [
    [
      "https://host/api/",
      "/api"
    ],
    [
      "http://h:3000",
      ""
    ],
    [
      "//cdn.x/v1?x=1",
      "/v1"
    ],
    [
      "localhost:8080/base#h",
      "/base"
    ],
    [
      "/rel/",
      "/rel"
    ],
    [
      "relative",
      null
    ],
    [
      "",
      ""
    ],
    [
      "  https://h/a/b  ",
      "/a/b"
    ],
    [
      "ftp+x://h/p",
      "/p"
    ]
  ];
  expect(cases.map(([v]) => [v, basePathOf(v) ?? null])).toEqual(cases);
});
