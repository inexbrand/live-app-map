/**
 * Пикер компонентов страницы: имя компонента, место JSX из стека React 19,
 * селектор и путь DOM; скрипт страницы с пикером собирается без ошибок.
 */
import { describe, expect, test } from 'bun:test';
import { injectScript } from './inject-script';
import * as pickDom from './pick-dom';
import * as pickSource from './pick-source';
import { pickerScriptText } from './pick-script';
import { componentNameOf, cssSelectorFor, domPathOf, frameFromStack, originalPosition, type PickElement } from './pick-script';

type Fake = PickElement & { children: Fake[] };

function el(tag: string, opts: { id?: string; cls?: string[]; testId?: string } = {}, kids: Fake[] = []): Fake {
  const node: Fake = {
    tagName: tag.toUpperCase(),
    id: opts.id ?? '',
    classList: opts.cls ?? [],
    parentElement: null,
    previousElementSibling: null,
    nextElementSibling: null,
    children: kids,
    getAttribute: (n) => (n === 'data-testid' ? (opts.testId ?? null) : null),
  };
  kids.forEach((k, i) => {
    Object.assign(k, { parentElement: node, previousElementSibling: i === 0 ? null : kids[i - 1], nextElementSibling: kids[i + 1] ?? null });
  });
  return node;
}

/** querySelectorAll на фейковом дереве для селекторов вида «a > b:nth-of-type(n)». */
function counter(root: Fake): (sel: string) => number {
  const all: Fake[] = [];
  const walk = (n: Fake): void => {
    all.push(n);
    n.children.forEach(walk);
  };
  walk(root);
  const selOf = (n: Fake, depth: number): string[] => {
    const out: string[] = [];
    let cur: Fake | null = n;
    for (let i = 0; i < depth && cur !== null; i++) {
      out.unshift(cssSelectorFor(cur, () => 1));
      cur = cur.parentElement as Fake | null;
    }
    return out;
  };
  return (sel) => {
    const parts = sel.split(' > ');
    return all.filter((n) => selOf(n, parts.length).join(' > ') === sel).length;
  };
}

describe('pick-script', () => {
  test('имя компонента: функция, memo, forwardRef; DOM-тег и строчные — нет', () => {
    function VacancyCard(): null {
      return null;
    }
    expect(componentNameOf(VacancyCard)).toBe('VacancyCard');
    expect(componentNameOf({ type: VacancyCard })).toBe('VacancyCard');
    expect(componentNameOf({ render: VacancyCard })).toBe('VacancyCard');
    expect(componentNameOf({ displayName: 'Styled(Button)' })).toBe('Styled(Button)');
    expect(componentNameOf('button')).toBeNull();
    expect(componentNameOf(function helper() {})).toBeNull();
  });

  test('место JSX из стека React 19: первый кадр приложения, не node_modules', () => {
    const stack = [
      'Error: react-stack-top-frame',
      '    at exports.jsxDEV (https://vite.localhost:5175/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=1a2b:250:30)',
      '    at VacancyCard (https://vite.localhost:5175/src/features/vacancies/VacancyCard.tsx?t=17000:45:7)',
      '    at FeedPage (https://vite.localhost:5175/src/pages/feed.tsx:12:3)',
    ].join('\n');
    expect(frameFromStack(stack)).toEqual({
      url: 'https://vite.localhost:5175/src/features/vacancies/VacancyCard.tsx?t=17000',
      file: 'src/features/vacancies/VacancyCard.tsx',
      line: 45,
      column: 7,
    });
    expect(frameFromStack('Error\n    at x (https://a/node_modules/react.js:1:1)')).toBeNull();
  });

  test('sourcemap v3: позиция в отданном коде → строка исходника', () => {
    // строка 1 → (1,1); строка 2 → (3,1); строка 3: столбец 5 → (3,5), столбец 15 → (3,6)
    const map = { sources: ['VacancyCard.tsx'], mappings: 'AAAA;AAEA;IAAI,UAAC' };
    expect(originalPosition(map, 2, 1)).toEqual({ source: 'VacancyCard.tsx', line: 3, column: 1 });
    expect(originalPosition(map, 3, 15)).toEqual({ source: 'VacancyCard.tsx', line: 3, column: 6 });
    expect(originalPosition(map, 3, 1)).toEqual({ source: 'VacancyCard.tsx', line: 3, column: 5 });
    expect(originalPosition(map, 9, 1)).toBeNull();
  });

  test('селектор: уникальный id, data-testid с номером среди одинаковых, утилиты и хэш-классы отброшены', () => {
    const b1 = el('button', { cls: ['apply', 'btn_x9f3a2'] });
    const b2 = el('button', { cls: ['apply', 'md:px-4', 'group/item'] });
    const list = el('main', {}, [el('div', {}, [b1]), el('div', {}, [b2])]);
    const root = el('body', {}, [el('div', { id: 'root' }, [list])]);
    const count = counter(root);
    expect(cssSelectorFor(b2, count)).toBe('div:nth-of-type(2) > button.apply');
    const card2 = el('div', { testId: 'card' }, [el('span')]);
    const feed = el('section', {}, [el('div', { testId: 'card' }, [el('span')]), card2]);
    el('body', {}, [feed]);
    expect(cssSelectorFor(card2.children[0] ?? card2, counter(feed))).toBe('div[data-testid="card"]:nth-of-type(2) > span');
    expect(cssSelectorFor(el('div', { id: 'root' }), () => 1)).toBe('div#root');
    expect(cssSelectorFor(el('a', { testId: 'cta' }), () => 1)).toBe('a[data-testid="cta"]');
    expect(domPathOf(b2)).toBe('body > div#root > main > div > button.apply');
  });

  test('скрипт страницы с пикером — валидный JS', () => {
    const script = injectScript({}, 'recruiter', true);
    const body = /<script data-lam-gateway>([\s\S]*)<\/script>$/.exec(script)?.[1] ?? '';
    expect(body).toContain('installPicker');
    expect(() => new Function(body)).not.toThrow();
  });

  test('скрипт страницы объявляет каждую функцию пикера, которую зовёт', () => {
    const text = pickerScriptText();
    const names = Object.entries({ ...pickDom, ...pickSource }).filter(([, v]) => typeof v === 'function').map(([k]) => k);
    const missing = names.filter((n) => new RegExp(`\\b${n}\\(`).test(text) && !text.includes(`function ${n}(`));
    expect(missing).toEqual([]);
  });
});
