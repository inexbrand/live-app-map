/**
 * Вызовы HTTP-клиентов через scanSource: внедрённый fetch, axios/ky (модуль, экземпляр, request),
 * window.fetch, клиенты проекта по имени (api.request, api.getRaw, без аргументов).
 */
import { expect, test } from 'bun:test';
import { callLines, scan } from './test/scan-project';

test('какие вызовы — запросы, их метод и путь', () => {
  const code = scan({ 'src/c.ts': "import axios from 'axios';\nimport ky from 'ky';\nimport { get as namedGet } from 'axios';\nimport other from 'other-lib';\nimport { treaty } from '@elysiajs/eden';\ndeclare const api: any;\ndeclare const apiFetch: (u: string) => unknown;\ndeclare const id: string;\nconst inst = axios.create({ baseURL: '/base' });\nconst eden = treaty('http://localhost');\nfunction fetchJson(u: string) { return fetch(u); }\nexport async function run(fetchWithAuth: typeof fetch, { authedFetch }: { authedFetch: typeof fetch }, notFetcher: typeof fetch, fetchy: typeof fetch) {\n  fetchWithAuth('/api/inj1', { method: 'POST' });\n  authedFetch('/api/inj2');\n  notFetcher('/api/no1');\n  fetchy('/api/no2');\n  apiFetch('/api/declared');\n  fetchJson('/api/wrap');\n  namedGet('/api/named');\n  other('/api/other');\n  eden('/api/eden-direct');\n  axios();\n  axios('/api/b', { method: 'post' });\n  axios.get('/api/g');\n  axios.post('/api/p', { a: 1 });\n  ky.delete('/api/kd');\n  inst.request({ url: '/r', method: 'put' });\n  inst.patch('/ip');\n  window.fetch('/api/w');\n  globalThis.fetch('/api/gt');\n  self.fetch('/api/self');\n  window.open('/api/open');\n  api.fetch('/api/apifetch');\n  api.getRaw('/api/raw');\n  api.getUser();\n  api.post();\n  api.request('/api/req', { method: 'DELETE' });\n  api.request('/api/req2');\n  api.send('/api/send', { method: 'PUT' });\n}\n" });
  expect(callLines(code)).toEqual([
    "DELETE /api/kd ky",
    "DELETE /api/req wrapper via api.request",
    "GET /api/apifetch wrapper via api.fetch",
    "GET /api/g axios",
    "GET /api/gt fetch",
    "GET /api/inj2 fetch",
    "GET /api/raw wrapper via api.getRaw",
    "GET /api/req2 wrapper via api.request",
    "GET /api/self fetch",
    "GET /api/w fetch",
    "GET /api/wrap wrapper via fetchJson",
    "PATCH /base/ip axios",
    "POST /api/b axios",
    "POST /api/inj1 fetch",
    "POST /api/p axios",
    "PUT /base/r axios"
  ]);
});
