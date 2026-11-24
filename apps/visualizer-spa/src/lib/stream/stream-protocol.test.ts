import { describe, expect, test } from 'bun:test';
import { decodeFrame, encodeFrame, isPageToHost, parseClientMessage, planSync, toPagePoint, type StreamScreen } from './stream-protocol';

const screen = (key: string, over: Partial<StreamScreen> = {}): StreamScreen => ({ key, url: `http://a.localhost/${key}`, width: 390, height: 844, live: true, ...over });

describe('кадр', () => {
  test('ключ и JPEG переживают упаковку, ключ в UTF-8', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3]);
    const out = decodeFrame(encodeFrame('miniapp:route:/чаты', jpeg));
    expect(out?.key).toBe('miniapp:route:/чаты');
    expect([...(out?.jpeg ?? [])]).toEqual([...jpeg]);
  });

  test('обрезанный кадр — null', () => {
    expect(decodeFrame(new Uint8Array([0, 9, 65]))).toBeNull();
    expect(decodeFrame(new Uint8Array([1]))).toBeNull();
  });
});

describe('сообщения карты', () => {
  test('sync, post и input разбираются; мусор — null', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'sync', screens: [screen('a')] }))).toEqual({ t: 'sync', screens: [screen('a')] });
    expect(parseClientMessage(JSON.stringify({ t: 'post', key: 'a', data: { lam: 'pick', on: true } }))).toEqual({ t: 'post', key: 'a', data: { lam: 'pick', on: true } });
    const input = { kind: 'mouse', type: 'down', x: 1, y: 2, button: 'left', clickCount: 1 };
    expect(parseClientMessage(JSON.stringify({ t: 'input', key: 'a', input }))).toEqual({ t: 'input', key: 'a', input });
    for (const bad of ['{', '{"t":"sync"}', '{"t":"sync","screens":[{"key":"a"}]}', '{"t":"input","key":"a","input":{"kind":"mouse","type":"fly","x":1,"y":1,"button":"left","clickCount":1}}', '{"t":"other"}']) {
      expect(parseClientMessage(bad)).toBeNull();
    }
  });
});

describe('сверка набора экранов', () => {
  test('новый — открыть, лишний — закрыть, адрес и размер — сменить, живость — старт/стоп', () => {
    const current = new Map([
      ['same', screen('same')],
      ['gone', screen('gone')],
      ['moved', screen('moved')],
      ['resized', screen('resized')],
      ['paused', screen('paused')],
      ['woke', screen('woke', { live: false })],
    ]);
    const plan = planSync(current, [
      screen('same'),
      screen('moved', { url: 'http://a.localhost/new' }),
      screen('resized', { width: 1920, height: 1080 }),
      screen('paused', { live: false }),
      screen('woke'),
      screen('fresh'),
    ]);
    expect(plan.open.map((s) => s.key)).toEqual(['fresh']);
    expect(plan.close).toEqual(['gone']);
    expect(plan.navigate.map((s) => s.key)).toEqual(['moved']);
    expect(plan.resize.map((s) => s.key)).toEqual(['resized']);
    expect(plan.stop).toEqual(['paused']);
    expect(plan.start).toEqual(['woke']);
  });

  test('тот же набор — пустой план; повтор ключа — берётся первый', () => {
    const plan = planSync(new Map([['a', screen('a')]]), [screen('a'), screen('a', { url: 'http://x/' })]);
    expect(plan).toEqual({ open: [], close: [], navigate: [], resize: [], start: [], stop: [] });
  });
});

describe('точка страницы', () => {
  test('из точки экрана над уменьшенным холстом', () => {
    expect(toPagePoint(150, 300, { left: 100, top: 200, width: 195, height: 422 }, { width: 390, height: 844 })).toEqual({ x: 100, y: 200 });
  });

  test('нулевой размер — точка начала', () => {
    expect(toPagePoint(5, 5, { left: 0, top: 0, width: 0, height: 0 }, { width: 390, height: 844 })).toEqual({ x: 0, y: 0 });
  });
});

describe('что страница шлёт карте', () => {
  test('отчёт, выбор и отмена — да; команды карты и чужое — нет', () => {
    expect(isPageToHost({ lam: 'page', href: 'x' })).toBe(true);
    expect(isPageToHost({ lam: 'picked', selector: 'a' })).toBe(true);
    expect(isPageToHost({ lam: 'pick-cancel' })).toBe(true);
    for (const d of [{ lam: 'pick', on: true }, { lam: 'flash' }, { lam: 'wheel' }, 'page', null, { type: 'page' }]) {
      expect(isPageToHost(d)).toBe(false);
    }
  });
});
