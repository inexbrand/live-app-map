/**
 * Пикер внутри страницы шлюза (happy-dom): визуализатор включает выбор, курсор
 * подсвечивает элемент с именем компонента React, клик отвечает родителю
 * селектором, рамкой и местом JSX; Esc отменяет; flash мигает рамкой.
 */
import { useDom } from '../../test/dom';
// Testing Library ставит свои хуки при загрузке: грузится здесь, а не из afterEach useDom
import '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { installPicker } from './pick-dom';

useDom();

const sent: unknown[] = [];
let api: Server | null = null;
let apiPort = 0;

/** Модуль dev-сервера со встроенной sourcemap: строка 2 отданного кода — строка 3 исходника. */
function moduleWithMap(): string {
  const map = { version: 3, sources: ['Card.tsx'], mappings: 'AAAA;AAEA' };
  return `a();\nb();\n//# sourceMappingURL=data:application/json;base64,${btoa(JSON.stringify(map))}\n`;
}

beforeAll(async () => {
  // Dev-сервер приложения: node:http — Response в DOM-окружении подменён happy-dom
  api = createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.end(req.url === '/src/Card.tsx' ? moduleWithMap() : 'no map');
  });
  await new Promise<void>((resolve) => api?.listen(0, '127.0.0.1', resolve));
  const address: AddressInfo | string | null = api.address();
  apiPort = address !== null && typeof address === 'object' ? address.port : 0;
  Reflect.set(window, 'postMessage', (m: unknown) => {
    sent.push(m);
  });
  installPicker();
});
afterAll(() => {
  api?.close();
});

beforeEach(() => {
  sent.length = 0;
  document.body.innerHTML = '';
});

function fromVisualizer(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data, source: window }));
}

type FakeFiber = { type?: unknown; return?: FakeFiber | null; _debugOwner?: FakeFiber | null; _debugSource?: unknown; _debugStack?: unknown };

/** Кнопка с fiber React: Button из UI-кита внутри VacancyCard. */
function reactButton(debug: Pick<FakeFiber, '_debugSource' | '_debugStack'>): HTMLButtonElement {
  function VacancyCard(): null {
    return null;
  }
  function Button(): null {
    return null;
  }
  const card: FakeFiber = { type: VacancyCard, return: null, ...debug };
  const button: FakeFiber = { type: Button, return: card, _debugOwner: card, _debugSource: { fileName: '/app/node_modules/ui/Button.tsx', lineNumber: 3 } };
  const host: FakeFiber = { type: 'button', return: button, _debugOwner: button };
  const el = document.createElement('button');
  el.className = 'apply';
  el.textContent = '  Откликнуться  ';
  Reflect.set(el, '__reactFiber$abc', host);
  document.body.append(el);
  return el;
}

function pointAt(el: Element | null): void {
  Reflect.set(document, 'elementFromPoint', () => el);
}

function box(): HTMLElement | null {
  return document.querySelector('[data-lam-pick-box]');
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function picked(): Record<string, unknown> | undefined {
  const m = sent.find((x) => typeof x === 'object' && x !== null && 'lam' in x && x.lam === 'picked');
  return typeof m === 'object' && m !== null ? Object.fromEntries(Object.entries(m)) : undefined;
}

describe('пикер страницы', () => {
  test('выключен — курсор и клик не трогают страницу', () => {
    const el = reactButton({});
    pointAt(el);
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5 }));
    const click = new MouseEvent('click', { cancelable: true });
    window.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(sent).toEqual([]);
  });

  test('подсветка с именем компонента; клик — ответ с селектором и местом JSX приложения', async () => {
    const el = reactButton({ _debugSource: { fileName: '/app/src/VacancyCard.tsx', lineNumber: 42 } });
    fromVisualizer({ lam: 'pick', on: true });
    pointAt(el);
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5 }));
    expect(box()?.style.display).toBe('block');
    expect(box()?.textContent).toBe('Button · button');
    const down = new MouseEvent('mousedown', { cancelable: true });
    window.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    window.dispatchEvent(new MouseEvent('click', { cancelable: true }));
    expect(picked()).toMatchObject({
      selector: 'button.apply',
      domPath: 'html > body > button.apply',
      tag: 'button',
      text: 'Откликнуться',
      component: { name: 'Button', chain: ['Button', 'VacancyCard'], stack: { file: '/app/src/VacancyCard.tsx', line: 42 } },
    });
    expect(box()?.style.display).toBe('none');
    // После выбора режим выключен
    sent.length = 0;
    window.dispatchEvent(new MouseEvent('click', { cancelable: true }));
    expect(sent).toEqual([]);
  });

  test('React 19: место из стека переводится по sourcemap модуля', async () => {
    const url = `http://127.0.0.1:${apiPort}/src/Card.tsx`;
    const el = reactButton({ _debugStack: { stack: `Error\n    at VacancyCard (${url}:2:1)` } });
    fromVisualizer({ lam: 'pick', on: true });
    pointAt(el);
    window.dispatchEvent(new MouseEvent('click', { cancelable: true }));
    for (let i = 0; i < 50 && picked() === undefined; i++) {
      await wait(20);
    }
    expect(picked()).toMatchObject({ component: { name: 'Button', stack: { file: 'src/Card.tsx', line: 3 } } });
  });

  test('модуль без sourcemap — файл без строки; не React — без компонента', async () => {
    const url = `http://127.0.0.1:${apiPort}/src/Other.tsx`;
    const el = reactButton({ _debugStack: { stack: `Error\n    at X (${url}:2:1)` } });
    fromVisualizer({ lam: 'pick', on: true });
    pointAt(el);
    window.dispatchEvent(new MouseEvent('click', { cancelable: true }));
    for (let i = 0; i < 50 && picked() === undefined; i++) {
      await wait(20);
    }
    expect(picked()).toMatchObject({ component: { stack: { file: 'src/Other.tsx', line: null } } });
    sent.length = 0;
    const plain = document.createElement('p');
    plain.setAttribute('aria-label', 'абзац');
    document.body.append(plain);
    fromVisualizer({ lam: 'pick', on: true });
    pointAt(plain);
    window.dispatchEvent(new MouseEvent('click', { cancelable: true }));
    expect(picked()).toMatchObject({ tag: 'p', text: 'абзац', component: null });
  });

  test('Esc отменяет выбор; уход курсора прячет рамку; выключение — тоже', () => {
    const el = reactButton({});
    fromVisualizer({ lam: 'pick', on: true });
    pointAt(el);
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 1, clientY: 1 }));
    window.dispatchEvent(new Event('mouseleave'));
    expect(box()?.style.display).toBe('none');
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 2, clientY: 2 }));
    fromVisualizer({ lam: 'pick', on: false });
    expect(box()?.style.display).toBe('none');
    fromVisualizer({ lam: 'pick', on: true });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(sent).toEqual([{ lam: 'pick-cancel' }]);
    // Чужие сообщения и не от родителя — мимо
    window.dispatchEvent(new MessageEvent('message', { data: { lam: 'pick', on: true }, source: null }));
    fromVisualizer('строка');
    window.dispatchEvent(new MouseEvent('click', { cancelable: true }));
    expect(sent).toEqual([{ lam: 'pick-cancel' }]);
  });

  test('flash: прокрутка к элементу и рамка на время; кривой селектор — ничего', async () => {
    const el = reactButton({});
    el.id = 'target';
    let scrolled = 0;
    el.scrollIntoView = () => {
      scrolled += 1;
    };
    fromVisualizer({ lam: 'flash', selector: '#target' });
    fromVisualizer({ lam: 'flash', selector: '#[bad' });
    fromVisualizer({ lam: 'flash', selector: '#nothing' });
    expect(scrolled).toBe(1);
    await wait(200);
    expect(box()?.style.display).toBe('block');
    await wait(1700);
    expect(box()?.style.display).toBe('none');
  });
});
