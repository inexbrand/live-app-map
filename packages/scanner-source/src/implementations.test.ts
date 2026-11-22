/**
 * Индекс реализаций интерфейсов через вызовы обёрток `x.send(path)`: какие реализации нашлись,
 * видно по HTTP-методу их fetch.
 */
import { expect, test } from 'bun:test';
import { callLines, scan } from './test/scan-project';

test('класс implements, фабрики-функции, стрелка и function с типом результата (и Promise<…>); extends, abstract, без типа — не реализации', () => {
  const code = scan({
    'src/impl.ts': "interface Api { send(path: string): unknown; }\ntype Alias = { send(path: string): unknown; };\ninterface Prop { send: (path: string) => unknown; }\ndeclare class Base { send(p: string): unknown; }\nclass A implements Api { send(p: string) { return fetch(p, { method: 'POST' }); } }\nconst f1 = (): Api => ({ send: (p: string) => fetch(p, { method: 'PUT' }) });\nasync function f2(): Promise<Api> { if (Math.random()) { return; } return { send(p: string) { return fetch(p, { method: 'PATCH' }); } }; }\nconst f3 = function (): Api { return { send: function (p: string) { return fetch(p, { method: 'DELETE' }); } }; };\nclass Ext extends Base { send(p: string) { return fetch(p, { method: 'HEAD' }); } }\nabstract class Abs implements Api { abstract send(p: string): unknown; }\nfunction f4(): Promise { return { send(p: string) { return fetch(p, { method: 'OPTIONS' }); } }; }\nfunction f5(): Api;\nfunction f5(): Api { return { send: (p: string) => fetch(p, { method: 'POST' }) }; }\nconst untyped = () => ({ send: (p: string) => fetch(p, { method: 'OPTIONS' }) });\nclass B implements Alias { send(p: string) { return fetch(p, { method: 'PATCH' }); } }\nclass C implements Prop { send(p: string) { return fetch(p, { method: 'PUT' }); } }\ndeclare const api: Api;\ndeclare const alias: Alias;\ndeclare const prop: Prop;\ndeclare const literal: { send(path: string): unknown };\nexport function run() {\n  api.send('/api/iface');\n  alias.send('/api/alias');\n  prop.send('/api/prop');\n  literal.send('/api/literal');\n  return [A, f1, f2, f3, Ext, Abs, f4, f5, untyped, B, C];\n}\n",
  });
  expect(callLines(code)).toEqual([
    'DELETE /api/iface wrapper via api.send',
    'PATCH /api/alias wrapper via alias.send',
    'PATCH /api/iface wrapper via api.send',
    'POST /api/iface wrapper via api.send',
    'PUT /api/iface wrapper via api.send',
    'PUT /api/prop wrapper via prop.send',
  ]);
});
