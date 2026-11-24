import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { lamFindOverride, lamMatchApiKey, lamParseStateId, lamRuntimeScript, lamStateIdFromPage } from '../src/runtime';
import { findProjectDir, lookupState, parseExportRef } from '../src/states-file';
import { components, screens } from './fixture/.live-app-map/states';
import { FIXTURE } from './harness';

describe('id состояния', () => {
  test('экран со слэшами в id делится по последнему /', () => {
    expect(lamParseStateId('miniapp:route:/feed/empty')).toEqual({ kind: 'screen', target: 'miniapp:route:/feed', state: 'empty' });
  });
  test('вариант компонента', () => {
    expect(lamParseStateId('component:src/ui/Button.tsx#Button/primary')).toEqual({ kind: 'component', target: 'src/ui/Button.tsx#Button', state: 'primary' });
  });
  test('кривой формат — null', () => {
    expect(lamParseStateId('empty')).toBeNull();
    expect(lamParseStateId('a/')).toBeNull();
    expect(lamParseStateId('component:/x')).toBeNull();
  });
  test('query важнее sessionStorage, страница компонента — по key и variant', () => {
    expect(lamStateIdFromPage('http://h/feed?lam_state=a:b/c', 'x/y', 'lam_state')).toBe('a:b/c');
    expect(lamStateIdFromPage('http://h/feed', 'x/y', 'lam_state')).toBe('x/y');
    expect(lamStateIdFromPage('http://h/@lam/component?key=src/A.tsx%23A&variant=v', null, 'lam_state')).toBe('component:src/A.tsx#A/v');
    expect(lamStateIdFromPage('http://h/feed', null, 'lam_state')).toBeNull();
  });
});

describe('ключ API', () => {
  test('метод, путь и :параметры', () => {
    expect(lamMatchApiKey('GET /api/v1/vacancies/:id', 'get', '/api/v1/vacancies/42')).toBe(true);
    expect(lamMatchApiKey('GET /api/v1/vacancies/:id', 'POST', '/api/v1/vacancies/42')).toBe(false);
    expect(lamMatchApiKey('GET /api/v1/vacancies/:id', 'GET', '/api/v1/vacancies')).toBe(false);
    expect(lamMatchApiKey('GET /api/v1/vacancies/:id', 'GET', '/api/v1/vacancies/')).toBe(false);
  });
  test('абсолютный адрес и query не мешают', () => {
    const api = { 'GET /api/items': { status: 200, body: [] } };
    expect(lamFindOverride(api, 'GET', 'https://api.example.com/api/items?page=2', 'http://h/')).toEqual({ status: 200, body: [] });
    expect(lamFindOverride(api, 'GET', '/api/other', 'http://h/')).toBeNull();
  });
});

describe('states.ts на сервере', () => {
  const mod = { screens, components };
  test('состояние экрана', () => {
    const r = lookupState(mod, 'app:route:/' + '/empty', 'states.ts');
    expect(r.ok).toBe(true);
    expect(r.ok ? r.payload.api?.['GET /api/items'] : null).toEqual({ status: 200, body: [] });
  });
  test('неизвестное состояние — ошибка со списком', () => {
    const r = lookupState(mod, 'app:route://nope', 'states.ts');
    expect(r).toEqual({ ok: false, error: 'У экрана «app:route:/» нет состояния «nope». Есть: empty, error, loading, slow' });
  });
  test('неизвестный компонент — ошибка со списком ключей', () => {
    const r = lookupState(mod, 'component:src/X.tsx#X/a', 'states.ts');
    expect(r.ok ? '' : r.error).toContain('src/Card.tsx#Card');
  });
  test('папка проекта ищется вверх от root', () => {
    expect(findProjectDir(path.join(FIXTURE, 'src'), existsSync, path.join, path.dirname)).toBe(FIXTURE);
    expect(parseExportRef('apps/a/src/B.tsx#B')).toEqual({ file: 'apps/a/src/B.tsx', name: 'B' });
    expect(parseExportRef('apps/a/src/B.tsx')).toBeNull();
  });
});

/** Исполняет текст рантайма в поддельном окне без lam_state. */
function runInFakeWindow(text: string): Record<string, unknown> {
  const fetchBefore = (): Promise<Response> => Promise.reject(new Error('не должен вызываться'));
  const win: Record<string, unknown> = {
    location: { href: 'http://h/feed' },
    sessionStorage: { getItem: () => null },
    fetch: fetchBefore,
    document: { querySelectorAll: () => [] },
  };
  new Function('window', text)(win);
  expect(win.fetch).toBe(fetchBefore);
  return win;
}

describe('текст рантайма', () => {
  test('после bun build (как в tarball) функции не переименованы и текст исполняется', async () => {
    const out = await Bun.build({ entrypoints: [path.join(import.meta.dir, '..', 'src', 'vite.ts')], target: 'node', external: ['vite'], outdir: mkdtempSync(path.join(tmpdir(), 'lam-sdk-dist-')) });
    expect(out.success).toBe(true);
    const file = out.outputs[0]?.path ?? '';
    const built = (await import(file)) as { lamVite: unknown };
    expect(typeof built.lamVite).toBe('function');
    const runtime = await Bun.build({ entrypoints: [path.join(import.meta.dir, '..', 'src', 'runtime', 'index.ts')], target: 'node', outdir: mkdtempSync(path.join(tmpdir(), 'lam-sdk-dist-')) });
    const rt = (await import(runtime.outputs[0]?.path ?? '')) as { lamRuntimeScript: (p: string) => string };
    const win = runInFakeWindow(rt.lamRuntimeScript('lam_state'));
    expect((win.__LAM__ as { stateId: unknown }).stateId).toBeNull();
  });

  test('исполняется сам по себе: без lam_state ставит __LAM__ и не трогает fetch', () => {
    const text = lamRuntimeScript('lam_state');
    expect(text).not.toContain('</script');
    const win = runInFakeWindow(text);
    const lam = win.__LAM__ as { stateId: unknown; components: () => unknown[] };
    expect(lam.stateId).toBeNull();
    expect(lam.components()).toEqual([]);
  });
});
