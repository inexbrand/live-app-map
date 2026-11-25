import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Browser, Page } from 'playwright-core';
import type { LamComponentInfo } from '../src/runtime';
import { serveMapApp, type MapApp } from '../src/map-serve';
import { FIXTURE, fixtureConfig, launchBrowser } from './harness';

// Копия фикстуры внутри пакета: правка исходника в тесте не трогает общую фикстуру, а react находится вверх по дереву
const ROOT = path.join(import.meta.dir, '.map-serve-fixture');
let app: MapApp;
let browser: Browser;
let base = '';

beforeAll(async () => {
  rmSync(ROOT, { recursive: true, force: true });
  cpSync(FIXTURE, ROOT, { recursive: true, filter: (src) => !src.includes('node_modules') });
  app = await serveMapApp({ root: ROOT, port: 0, inline: () => {
    const { root: _root, cacheDir: _cache, ...inline } = fixtureConfig();
    return { ...inline, configFile: false };
  } });
  base = app.url;
  browser = await launchBrowser();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await app?.close();
  rmSync(ROOT, { recursive: true, force: true });
});

async function settled(page: Page, testId: string): Promise<string> {
  await page.waitForFunction((id) => {
    const el = document.querySelector('[data-testid="' + id + '"]');
    return el !== null && el.textContent !== 'загрузка';
  }, testId, { timeout: 15_000 });
  return page.innerText('[data-testid="' + testId + '"]');
}

describe('сборка для карты', () => {
  test('страница из бандла: один скрипт вместо модулей исходников', async () => {
    const page = await browser.newPage();
    const scripts: string[] = [];
    page.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(new URL(r.url()).pathname); });
    await page.goto(base + '/');
    expect(await settled(page, 'list')).toBe('200 [{"id":1,"title":"настоящая"}]');
    expect(scripts.some((s) => s.startsWith('/src/'))).toBe(false);
    expect(scripts.some((s) => s.startsWith('/assets/'))).toBe(true);
    await page.close();
  }, 30_000);

  test('состояние по lam_state подменяет API', async () => {
    const page = await browser.newPage();
    await page.goto(base + '/?lam_state=' + encodeURIComponent('app:route://empty'));
    expect(await settled(page, 'list')).toBe('200 []');
    await page.close();
  }, 30_000);

  test('/@lam/state отдаёт описание состояния', async () => {
    const ok = await fetch(base + '/@lam/state?id=' + encodeURIComponent('app:route://error'));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ id: 'error', label: 'Ошибка', api: { 'GET /api/items': { status: 500, body: 'упало' } } });
  });

  test('React в режиме разработки: дерево компонентов с файлами', async () => {
    const page = await browser.newPage();
    await page.goto(base + '/');
    await settled(page, 'list');
    // Карта бандла читается при загрузке страницы — ждём, пока файл станет исходником
    const card = await page.waitForFunction(() => {
      const list = (window as unknown as { __LAM__: { components: () => LamComponentInfo[] } }).__LAM__.components();
      const c = list.find((x) => x.name === 'Card');
      return c !== undefined && c.file === 'src/Card.tsx' ? c : null;
    }, undefined, { timeout: 10_000 }).then((h) => h.jsonValue() as Promise<LamComponentInfo>);
    expect(card.parent).toBe('App');
    expect(card.usedAt?.file).toBe('src/App.tsx');
    expect(card.usedAt?.line).toBeGreaterThan(0);
    await page.close();
  }, 30_000);

  test('страница компонента: вариант в обёртке со стилями', async () => {
    const page = await browser.newPage();
    await page.goto(base + '/@lam/component?key=' + encodeURIComponent('src/Card.tsx#Card') + '&variant=red');
    await page.waitForSelector('[data-testid="frame"] [data-testid="card"]', { timeout: 15_000 });
    expect(await page.innerText('[data-testid="card"] h2')).toBe('Из варианта');
    expect(await page.$eval('[data-testid="card"]', (el) => getComputedStyle(el).borderTopColor)).toBe('rgb(255, 0, 0)');
    await page.close();
  }, 30_000);

  test('правка исходника: пересборка и перезагрузка открытой страницы', async () => {
    const page = await browser.newPage();
    await page.goto(base + '/');
    await page.waitForSelector('[data-testid="card"] h2');
    const file = path.join(ROOT, 'src', 'App.tsx');
    const src = readFileSync(file, 'utf8');
    const before = await page.innerText('[data-testid="card"] h2');
    writeFileSync(file, src.replace(before, 'Правка ' + before));
    await page.waitForFunction((t) => document.querySelector('[data-testid="card"] h2')?.textContent === t, 'Правка ' + before, { timeout: 20_000 });
    await page.close();
  }, 40_000);
});
