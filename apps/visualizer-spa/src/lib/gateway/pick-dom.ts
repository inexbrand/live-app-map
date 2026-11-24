/**
 * Пикер, сторона DOM: селектор, путь, компонент под элементом, установка режима выбора.
 *
 * Функции встраиваются в скрипт страницы как текст (toString, pick-script.ts): без
 * замыканий, друг друга зовут по имени; импорты здесь — только для проверки типов.
 */
import type { DebugPlace, Fiber } from '@live-app-map/sdk/runtime';
import { componentNameOf, debugPlaceOf, fiberOf } from '@live-app-map/sdk/runtime';
import type { PickElement, RawComponent, StackSource } from './pick-messages';
import { mapFrame } from './pick-source';

// fiber и место JSX — общие с рантаймом SDK
export { debugPlaceOf, fiberOf } from '@live-app-map/sdk/runtime';

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
 * Место JSX в коде приложения. Элемент из библиотеки (кнопка UI-кита) создан в её
 * коде: поднимаемся по владельцам до места, где библиотечный компонент вызван.
 */
export function appPlaceOf(host: Fiber): DebugPlace {
  let f: Fiber | null | undefined = host;
  for (let n = 0; f !== null && f !== undefined && n < 24; n++) {
    const place = debugPlaceOf(f);
    if (place.source !== null || place.frame !== null) {
      return place;
    }
    f = f._debugOwner ?? f.return;
  }
  return { source: null, frame: null };
}

/** Имена компонентов над элементом, ближайший первым (до 8, без повторов). */
export function componentChainOf(host: Fiber): string[] {
  const chain: string[] = [];
  for (let f: Fiber | null | undefined = host.return; f !== null && f !== undefined && chain.length < 8; f = f.return) {
    const n = componentNameOf(f.type);
    if (n !== null && chain.indexOf(n) === -1) {
      chain.push(n);
    }
  }
  return chain;
}

/**
 * Компонент React над DOM-элементом: имя ближайшего, цепочка вверх и место
 * JSX (React 18 — `_debugSource`, React 19 — `_debugStack`).
 *
 * @param el - DOM-элемент страницы
 */
export function reactComponentOf(el: Element): RawComponent | null {
  const host = fiberOf(el);
  const chain = host === null ? [] : componentChainOf(host);
  const first = chain[0];
  if (host === null || first === undefined) {
    return null;
  }
  const place = appPlaceOf(host);
  return { name: first, chain, source: place.source, frame: place.frame };
}

/** Состояние пикера страницы. */
export type PickerState = { on: boolean; box: HTMLDivElement | null; label: HTMLDivElement | null; current: Element | null };

/** Рамка подсветки с подписью (создаётся один раз). */
export function pickerBox(s: PickerState): { readonly box: HTMLDivElement; readonly label: HTMLDivElement } {
  if (s.box !== null && s.label !== null) {
    return { box: s.box, label: s.label };
  }
  const box = document.createElement('div');
  box.setAttribute('data-lam-pick-box', '');
  box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #0a0a0a;box-shadow:0 0 0 1px #fff;background:rgba(10,10,10,.06);border-radius:6px;transition:all .06s ease-out;display:none';
  const label = document.createElement('div');
  label.style.cssText = 'position:absolute;left:-2px;bottom:100%;margin-bottom:4px;padding:2px 8px;border-radius:6px;background:#0a0a0a;color:#fff;box-shadow:0 0 0 1px #fff;font-weight:500;font-size:12px;line-height:20px;white-space:nowrap';
  box.appendChild(label);
  document.documentElement.appendChild(box);
  s.box = box;
  s.label = label;
  return { box, label };
}

export function pickerHide(s: PickerState): void {
  if (s.box !== null) {
    s.box.style.display = 'none';
  }
  s.current = null;
}

/** Рамка вокруг элемента; подпись — над ним, у верхнего края — под ним. */
export function pickerShow(s: PickerState, el: Element): void {
  const { box, label } = pickerBox(s);
  const r = el.getBoundingClientRect();
  box.style.display = 'block';
  box.style.left = r.left + 'px';
  box.style.top = r.top + 'px';
  box.style.width = r.width + 'px';
  box.style.height = r.height + 'px';
  label.textContent = pickerTitle(el);
  label.style.bottom = r.top < 28 ? 'auto' : '100%';
  label.style.top = r.top < 28 ? '100%' : 'auto';
}

/** «Компонент · тег» или просто тег. */
export function pickerTitle(el: Element): string {
  const c = reactComponentOf(el);
  const tag = el.tagName.toLowerCase();
  return c === null ? tag : c.name + ' · ' + tag;
}

export function pickerMove(s: PickerState, e: MouseEvent): void {
  const el = s.on ? document.elementFromPoint(e.clientX, e.clientY) : null;
  if (el === null || el === s.box || el === s.current) {
    return;
  }
  s.current = el;
  pickerShow(s, el);
}

/** В режиме выбора нажатия не доходят до страницы. */
export function pickerSwallow(s: PickerState, e: Event): void {
  if (s.on) {
    e.preventDefault();
    e.stopPropagation();
  }
}

/** Ответ родителю о выбранном элементе. */
export function pickedMessage(el: Element, raw: RawComponent | null, stack: StackSource | null): Record<string, unknown> {
  const r = el.getBoundingClientRect();
  const text = ((el as HTMLElement).innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return {
    lam: 'picked',
    selector: cssSelectorFor(el, (q) => document.querySelectorAll(q).length),
    domPath: domPathOf(el),
    tag: el.tagName.toLowerCase(),
    text,
    rect: { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height },
    client: { x: r.left, y: r.top, width: r.width, height: r.height },
    viewport: { width: innerWidth, height: innerHeight },
    component: raw === null ? null : { name: raw.name, chain: raw.chain, stack },
  };
}

/** Клик в режиме выбора: элемент под курсором — родителю, режим выключается. */
export function pickerClick(s: PickerState, e: MouseEvent): void {
  if (!s.on) {
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  const el = s.current ?? document.elementFromPoint(e.clientX, e.clientY);
  if (el === null) {
    return;
  }
  s.on = false;
  pickerHide(s);
  const raw = reactComponentOf(el);
  // Рамка элемента снимается сейчас; позиция в исходнике — когда прочитается sourcemap
  const rect = pickedMessage(el, raw, null);
  pickerSourceOf(raw, (stack) => parent.postMessage({ ...rect, component: raw === null ? null : { name: raw.name, chain: raw.chain, stack } }, '*'));
}

/** Место JSX для ответа: сразу из _debugSource или по sourcemap кадра (не дольше 1,5 с). */
export function pickerSourceOf(raw: RawComponent | null, send: (s: StackSource | null) => void): void {
  if (raw === null || raw.frame === null) {
    send(raw === null ? null : raw.source);
    return;
  }
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
}

/** Прокрутить к элементу и мигнуть рамкой; кривой селектор или нет элемента — ничего. */
export function pickerFlash(s: PickerState, selector: string): void {
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
    pickerShow(s, target);
    setTimeout(() => pickerHide(s), 1600);
  }, 120);
}

/** Esc в режиме выбора — отмена, родителю `pick-cancel`. */
export function pickerKey(s: PickerState, e: KeyboardEvent): void {
  if (s.on && e.key === 'Escape') {
    s.on = false;
    pickerHide(s);
    parent.postMessage({ lam: 'pick-cancel' }, '*');
  }
}

/** Команды родителя: `{lam:'pick', on}` и `{lam:'flash', selector}`. */
export function pickerMessage(s: PickerState, e: MessageEvent): void {
  const d: unknown = e.data;
  if (e.source !== parent || typeof d !== 'object' || d === null || !('lam' in d)) {
    return;
  }
  pickerCommand(s, d);
}

/** Команда родителя: включить/выключить выбор или мигнуть элементом. */
export function pickerCommand(s: PickerState, d: { readonly lam: unknown }): void {
  if (d.lam === 'pick') {
    s.on = 'on' in d && d.on === true;
    if (!s.on) {
      pickerHide(s);
    }
  }
  if (d.lam === 'flash' && 'selector' in d && typeof d.selector === 'string') {
    pickerFlash(s, d.selector);
  }
}

/**
 * Режим выбора в странице: подсветка под курсором, клик — ответ родителю.
 * Зовётся один раз из скрипта шлюза; дальше живёт на сообщениях.
 */
export function installPicker(): void {
  const s: PickerState = { on: false, box: null, label: null, current: null };
  addEventListener('mousemove', (e: MouseEvent) => pickerMove(s, e), true);
  addEventListener('click', (e: MouseEvent) => pickerClick(s, e), true);
  addEventListener('mousedown', (e) => pickerSwallow(s, e), true);
  addEventListener('pointerdown', (e) => pickerSwallow(s, e), true);
  addEventListener('mouseup', (e) => pickerSwallow(s, e), true);
  addEventListener('keydown', (e: KeyboardEvent) => pickerKey(s, e), true);
  addEventListener('mouseleave', () => {
    if (s.on) {
      pickerHide(s);
    }
  });
  addEventListener('message', (e) => pickerMessage(s, e));
}
