import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Browser, Page } from 'playwright-core';
import { build, type ViteDevServer } from 'vite';
import type { LamComponentInfo } from '../src/runtime';
import { fixtureConfig, launchBrowser, startFixture } from './harness';

let server: ViteDevServer;
let base = '';
let browser: Browser;

beforeAll(async () => {
  const started = await startFixture();
  server = started.server;
  base = started.base;
  browser = await launchBrowser();
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function open(url: string, init?: (page: Page) => Promise<unknown>): Promise<Page> {
  const page = await browser.newPage();
  if (init !== undefined) {
    await init(page);
  }
  await page.goto(base + url);
  return page;
}

async function texts(page: Page): Promise<{ list: string; one: string }> {
  await page.waitForFunction(() => document.querySelector('[data-testid="list"]') !== null);
  return { list: await page.innerText('[data-testid="list"]'), one: await page.innerText('[data-testid="one"]') };
}

/** Ждёт, пока текст элемента перестанет быть «загрузка». */
async function settled(page: Page, testId: string): Promise<string> {
  await page.waitForFunction((id) => {
    const el = document.querySelector('[data-testid="' + id + '"]');
    return el !== null && el.textContent !== 'загрузка';
  }, testId, { timeout: 15_000 });
  return page.innerText('[data-testid="' + testId + '"]');
}

describe('подмена API по lam_state', () => {
  test('без lam_state — настоящий API', async () => {
    const page = await open('/');
    expect(await settled(page, 'list')).toBe('200 [{"id":1,"title":"настоящая"}]');
    expect(await settled(page, 'one')).toBe('200 {"id":7}');
    await page.close();
  }, 30_000);

  test('пустое состояние: fetch и XHR с :id получают ответы из states.ts', async () => {
    const page = await open('/?lam_state=' + encodeURIComponent('app:route://empty'));
    expect(await settled(page, 'list')).toBe('200 []');
    expect(await settled(page, 'one')).toBe('404 {"error":"нет"}');
    await page.close();
  }, 30_000);

  test('ошибка: строковое тело и 500; XHR без ключа идёт на сервер', async () => {
    const page = await open('/?lam_state=' + encodeURIComponent('app:route://error'));
    expect(await settled(page, 'list')).toBe('500 упало');
    expect(await settled(page, 'one')).toBe('200 {"id":7}');
    await page.close();
  }, 30_000);

  test('pending: ответа нет никогда', async () => {
    const page = await open('/?lam_state=' + encodeURIComponent('app:route://loading'));
    await page.waitForTimeout(1500);
    expect(await texts(page)).toEqual({ list: 'загрузка', one: 'загрузка' });
    await page.close();
  }, 30_000);

  test('delayMs: ответ не раньше задержки', async () => {
    const page = await open('/?lam_state=' + encodeURIComponent('app:route://slow'));
    await page.waitForTimeout(250);
    expect((await texts(page)).list).toBe('загрузка');
    expect(await settled(page, 'list')).toBe('200 [1]');
    await page.close();
  }, 30_000);

  test('lam_state из sessionStorage (так кладёт шлюз)', async () => {
    const page = await open('/', (p) => p.addInitScript(() => sessionStorage.setItem('lam_state', 'app:route://empty')));
    expect(await settled(page, 'list')).toBe('200 []');
    await page.close();
  }, 30_000);

  test('/@lam/state: описание и 404 с подсказкой', async () => {
    const ok = await fetch(base + '/@lam/state?id=' + encodeURIComponent('app:route://error'));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ id: 'error', label: 'Ошибка', api: { 'GET /api/items': { status: 500, body: 'упало' } } });
    const bad = await fetch(base + '/@lam/state?id=' + encodeURIComponent('app:route://nope'));
    expect(bad.status).toBe(404);
    expect(await bad.text()).toBe('У экрана «app:route:/» нет состояния «nope». Есть: empty, error, loading, slow');
  });
});

describe('дерево компонентов', () => {
  test('__LAM__.components(): имена, файлы, место вызова, рамка', async () => {
    const page = await open('/');
    await settled(page, 'list');
    const list = await page.evaluate(() => (window as unknown as { __LAM__: { components: () => unknown[] } }).__LAM__.components()) as LamComponentInfo[];
    const app = list.find((c) => c.name === 'App');
    const card = list.find((c) => c.name === 'Card');
    expect(app?.depth).toBe(0);
    expect(app?.file).toBe('src/App.tsx');
    expect(app?.usedAt?.file).toBe('src/main.tsx');
    expect(card?.parent).toBe('App');
    expect(card?.depth).toBe(1);
    expect(card?.file).toBe('src/Card.tsx');
    expect(card?.usedAt?.file).toBe('src/App.tsx');
    expect(card?.rect?.width).toBe(200);
    expect(card?.rect?.height).toBe(80);
    await page.close();
  }, 30_000);
});

describe('страница компонента', () => {
  test('вариант с props в обёртке и со стилями', async () => {
    const page = await open('/@lam/component?key=' + encodeURIComponent('src/Card.tsx#Card') + '&variant=red');
    await page.waitForSelector('[data-testid="frame"] [data-testid="card"]', { timeout: 15_000 });
    expect(await page.innerText('[data-testid="card"] h2')).toBe('Из варианта');
    expect(await page.getAttribute('[data-testid="card"]', 'data-tone')).toBe('red');
    expect(await page.$eval('[data-testid="card"]', (el) => getComputedStyle(el).borderTopColor)).toBe('rgb(255, 0, 0)');
    await page.close();
  }, 30_000);

  test('api варианта подменяет запрос компонента', async () => {
    const page = await open('/@lam/component?key=' + encodeURIComponent('src/Remote.tsx#Remote') + '&variant=empty');
    expect(await settled(page, 'remote')).toBe('200 []');
    await page.close();
  }, 30_000);

  test('неизвестный вариант — 404 со списком', async () => {
    const r = await fetch(base + '/@lam/component?key=' + encodeURIComponent('src/Card.tsx#Card') + '&variant=blue');
    expect(r.status).toBe(404);
    expect(await r.text()).toBe('У компонента «src/Card.tsx#Card» нет варианта «blue». Есть: red');
  });
});

describe('production-сборка', () => {
  test('vite build: в бандле нет рантайма', async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'lam-sdk-build-'));
    await build(fixtureConfig({ build: { outDir, emptyOutDir: true } }));
    const files = readdirSync(outDir, { recursive: true }).map(String).filter((f) => /\.(js|html)$/.test(f));
    expect(files.length).toBeGreaterThan(1);
    const all = files.map((f) => readFileSync(path.join(outDir, f), 'utf8')).join('\n');
    expect(all).toContain('/api/items');
    for (const marker of ['__LAM__', 'lam_state', 'lamRuntimeInstall', '/@lam/']) {
      expect(all).not.toContain(marker);
    }
  }, 60_000);
});
