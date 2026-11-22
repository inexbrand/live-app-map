/**
 * Пикер, сторона DOM: селектор, путь, компонент под элементом, установка режима выбора.
 *
 * Функции встраиваются в скрипт страницы как текст (toString, pick-script.ts): без
 * замыканий, друг друга зовут по имени; импорты здесь — только для проверки типов.
 */
import type { PickElement, RawComponent, StackFrame, StackSource } from './pick-messages';
import { componentNameOf, frameFromStack, mapFrame } from './pick-source';

/**
 * Селектор элемента: id, если он уникален, иначе цепочка «тег.класс:nth-of-type»
 * от ближайшего уникального предка; классы-хэши (CSS-модули) отбрасываются.
 *
 * @param el - элемент
 * @param count - сколько элементов находит селектор (document.querySelectorAll)
 */
export function cssSelectorFor(el: PickElement, count: (selector: string) => number): string {
  let selector = '';
  for (let e: PickElement | null = el; e !== null && e.tagName.toLowerCase() !== 'html'; e = e.parentElement) {
    selector = selector === '' ? selectorPart(e) : selectorPart(e) + ' > ' + selector;
    if (count(selector) === 1) {
      return selector;
    }
  }
  return selector === '' ? el.tagName.toLowerCase() : selector;
}

export function cssEscape(s: string): string {
  return s.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}

/** Звено селектора: #id (если не сгенерирован), иначе тег с data-testid или классами и :nth-of-type среди близнецов. */
export function selectorPart(e: PickElement): string {
  const tag = e.tagName.toLowerCase();
  if (e.id !== '' && !/\d{3,}/.test(e.id)) {
    return tag + '#' + cssEscape(e.id);
  }
  const base = tag + qualifierOf(e);
  const nth = nthOfType(e);
  return nth === null ? base : base + ':nth-of-type(' + nth + ')';
}

/** data-testid, иначе два осмысленных класса. */
export function qualifierOf(e: PickElement): string {
  const testId = e.getAttribute('data-testid');
  if (testId !== null && testId !== '') {
    return '[data-testid="' + testId.replace(/"/g, '\\"') + '"]';
  }
  // Два осмысленных класса; утилиты с вариантами (md:, group/x, [..]) и хэши — шум
  let out = '';
  let n = 0;
  for (let i = 0; i < e.classList.length && n < 2; i++) {
    const c = e.classList[i] ?? '';
    if (c !== '' && !/[:/[\]()!.%]|[0-9a-f]{5,}|__|_[a-zA-Z0-9]{5}$/.test(c)) {
      out += '.' + cssEscape(c);
      n++;
    }
  }
  return out;
}

/** Номер среди соседей того же тега; один такой — null. */
export function nthOfType(e: PickElement): number | null {
  let nth = 1;
  let twins = false;
  for (let s = e.previousElementSibling; s !== null; s = s.previousElementSibling) {
    if (s.tagName === e.tagName) {
      nth++;
      twins = true;
    }
  }
  for (let s = e.nextElementSibling; s !== null && !twins; s = s.nextElementSibling) {
    twins = s.tagName === e.tagName;
  }
  return twins ? nth : null;
}

/**
 * Путь DOM для человека: «body > div#root > main > button.apply».
 *
 * @param el - элемент
 */
export function domPathOf(el: PickElement): string {
  const parts: string[] = [];
  for (let e: PickElement | null = el; e !== null && parts.length < 12; e = e.parentElement) {
    const cls = e.classList.length > 0 ? '.' + (e.classList[0] ?? '') : '';
    parts.unshift(e.tagName.toLowerCase() + (e.id !== '' ? '#' + e.id : cls));
  }
  return parts.join(' > ');
}

/**
 * Компонент React над DOM-элементом: имя ближайшего, цепочка вверх и место
 * JSX (React 18 — `_debugSource`, React 19 — `_debugStack`).
 *
 * @param el - DOM-элемент страницы
 */
export function reactComponentOf(el: Element): RawComponent | null {
  const rec = el as unknown as Record<string, unknown>;
  let fiber: unknown = null;
  for (const k of Object.keys(rec)) {
    if (k.indexOf('__reactFiber$') === 0) {
      fiber = rec[k];
      break;
    }
  }
  if (typeof fiber !== 'object' || fiber === null) {
    return null;
  }
  type Fiber = {
    type?: unknown;
    return?: Fiber | null;
    _debugOwner?: Fiber | null;
    _debugStack?: { stack?: unknown } | null;
    _debugSource?: { fileName?: unknown; lineNumber?: unknown } | null;
  };
  const host = fiber as Fiber;
  let source: StackSource | null = null;
  let frame: StackFrame | null = null;
  // Элемент из библиотеки (кнопка UI-кита) создан в её коде: поднимаемся по
  // владельцам до места в коде приложения, где библиотечный компонент вызван
  for (let f: Fiber | null | undefined = host, n = 0; f !== null && f !== undefined && n < 24 && source === null && frame === null; f = f._debugOwner ?? f.return, n++) {
    const ds = f._debugSource;
    if (ds !== undefined && ds !== null && typeof ds.fileName === 'string' && typeof ds.lineNumber === 'number') {
      if (ds.fileName.indexOf('/node_modules/') === -1) {
        source = { file: ds.fileName, line: ds.lineNumber };
      }
    } else if (f._debugStack !== undefined && f._debugStack !== null && typeof f._debugStack.stack === 'string') {
      frame = frameFromStack(f._debugStack.stack);
    }
  }
  const chain: string[] = [];
  for (let f: Fiber | null | undefined = host.return; f !== null && f !== undefined && chain.length < 8; f = f.return) {
    const n = componentNameOf(f.type);
    if (n !== null && chain.indexOf(n) === -1) {
      chain.push(n);
    }
  }
  const first = chain[0];
  return first === undefined ? null : { name: first, chain, source, frame };
}

/**
 * Режим выбора в странице: подсветка под курсором, клик — ответ родителю.
 * Зовётся один раз из скрипта шлюза; дальше живёт на сообщениях.
 */
export function installPicker(): void {
  let on = false;
  let box: HTMLDivElement | null = null;
  let label: HTMLDivElement | null = null;
  let current: Element | null = null;
  const ensureBox = (): void => {
    if (box !== null) {
      return;
    }
    box = document.createElement('div');
    box.setAttribute('data-lam-pick-box', '');
    box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #0a0a0a;box-shadow:0 0 0 1px #fff;background:rgba(10,10,10,.06);border-radius:6px;transition:all .06s ease-out;display:none';
    label = document.createElement('div');
    label.style.cssText = 'position:absolute;left:-2px;bottom:100%;margin-bottom:4px;padding:2px 8px;border-radius:6px;background:#0a0a0a;color:#fff;box-shadow:0 0 0 1px #fff;font-weight:500;font-size:12px;line-height:20px;white-space:nowrap';
    box.appendChild(label);
    document.documentElement.appendChild(box);
  };
  const hide = (): void => {
    if (box !== null) {
      box.style.display = 'none';
    }
    current = null;
  };
  const show = (el: Element, text: string): void => {
    ensureBox();
    const r = el.getBoundingClientRect();
    if (box === null || label === null) {
      return;
    }
    box.style.display = 'block';
    box.style.left = r.left + 'px';
    box.style.top = r.top + 'px';
    box.style.width = r.width + 'px';
    box.style.height = r.height + 'px';
    label.textContent = text;
    label.style.bottom = r.top < 28 ? 'auto' : '100%';
    label.style.top = r.top < 28 ? '100%' : 'auto';
  };
  const describe = (el: Element): string => {
    const c = reactComponentOf(el);
    const tag = el.tagName.toLowerCase();
    return c === null ? tag : c.name + ' · ' + tag;
  };
  const onMove = (e: MouseEvent): void => {
    if (!on) {
      return;
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el === null || el === box || el === current) {
      return;
    }
    current = el;
    show(el, describe(el));
  };
  const swallow = (e: Event): void => {
    if (on) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const onClick = (e: MouseEvent): void => {
    if (!on) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const el = current ?? document.elementFromPoint(e.clientX, e.clientY);
    if (el === null) {
      return;
    }
    on = false;
    hide();
    const r = el.getBoundingClientRect();
    const text = ((el as HTMLElement).innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const raw = reactComponentOf(el);
    const send = (stack: StackSource | null): void => parent.postMessage({
      lam: 'picked',
      selector: cssSelectorFor(el, (s) => document.querySelectorAll(s).length),
      domPath: domPathOf(el),
      tag: el.tagName.toLowerCase(),
      text,
      rect: { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height },
      client: { x: r.left, y: r.top, width: r.width, height: r.height },
      viewport: { width: innerWidth, height: innerHeight },
      component: raw === null ? null : { name: raw.name, chain: raw.chain, stack },
    }, '*');
    if (raw === null || raw.frame === null) {
      send(raw === null ? null : raw.source);
      return;
    }
    // Рамка элемента снимается сейчас; позиция в исходнике — когда прочитается sourcemap (до 1,5 с)
    const frame = raw.frame;
    let done = false;
    const once = (s: StackSource | null): void => {
      if (!done) {
        done = true;
        send(s);
      }
    };
    setTimeout(() => once({ file: frame.file, line: null }), 1500);
    mapFrame(frame).then(once, () => once({ file: frame.file, line: null }));
  };
  const flash = (selector: string): void => {
    let el: Element | null = null;
    try {
      el = document.querySelector(selector);
    } catch (err) {
      el = null;
    }
    if (el === null) {
      return;
    }
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const target = el;
    setTimeout(() => {
      show(target, describe(target));
      setTimeout(hide, 1600);
    }, 120);
  };
  addEventListener('mousemove', onMove, true);
  addEventListener('click', onClick, true);
  addEventListener('mousedown', swallow, true);
  addEventListener('pointerdown', swallow, true);
  addEventListener('mouseup', swallow, true);
  addEventListener('keydown', (e: KeyboardEvent) => {
    if (on && e.key === 'Escape') {
      on = false;
      hide();
      parent.postMessage({ lam: 'pick-cancel' }, '*');
    }
  }, true);
  addEventListener('mouseleave', () => {
    if (on) {
      hide();
    }
  });
  addEventListener('message', (e) => {
    const d: unknown = e.data;
    if (e.source !== parent || typeof d !== 'object' || d === null || !('lam' in d)) {
      return;
    }
    if (d.lam === 'pick') {
      on = 'on' in d && d.on === true;
      if (!on) {
        hide();
      }
    }
    if (d.lam === 'flash' && 'selector' in d && typeof d.selector === 'string') {
      flash(d.selector);
    }
  });
}
