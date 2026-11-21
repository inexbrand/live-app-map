/**
 * Выбор компонента курсором внутри страницы шлюза (часть inject-script).
 * Визуализатор шлёт странице `{lam:'pick', on}`; страница подсвечивает
 * элемент под курсором и по клику отвечает `{lam:'picked', …}`: селектор,
 * путь DOM, текст, рамка, компонент React и место в исходнике (dev).
 * `{lam:'flash', selector}` — прокрутить к элементу и мигнуть рамкой.
 *
 * Функции встраиваются в скрипт страницы как текст (toString): без
 * импортов и замыканий, друг друга зовут по имени.
 */

/** Место в исходнике из стека React (dev); line — исходная строка, null — не удалось перевести. */
export type StackSource = { readonly file: string; readonly line: number | null };

/** Кадр стека: модуль, как его отдал dev-сервер, и позиция в отданном коде. */
export type StackFrame = { readonly url: string; readonly file: string; readonly line: number; readonly column: number };

/** Исходная позиция по sourcemap. */
export type OriginalPosition = { readonly source: string; readonly line: number; readonly column: number };

/** Компонент React над элементом. */
export type PickedComponent = {
  readonly name: string;
  readonly chain: readonly string[];
  readonly stack: StackSource | null;
};

/** Компонент из fiber до перевода позиции: кадр стека ещё в отданном коде. */
export type RawComponent = {
  readonly name: string;
  readonly chain: readonly string[];
  /** React 18: уже исходная позиция. */
  readonly source: StackSource | null;
  /** React 19: кадр стека для sourcemap. */
  readonly frame: StackFrame | null;
};

/** Рамка, CSS px. */
export type PickRect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** Ответ страницы: выбранный элемент. */
export type LamPickedMessage = {
  readonly lam: 'picked';
  readonly selector: string;
  readonly domPath: string;
  readonly tag: string;
  readonly text: string;
  /** В координатах документа. */
  readonly rect: PickRect;
  /** В координатах окна страницы (для снимка). */
  readonly client: PickRect;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly component: PickedComponent | null;
};

/** Пользователь отменил выбор (Esc в странице). */
export type LamPickCancelMessage = { readonly lam: 'pick-cancel' };

/** Минимум элемента, нужный для селектора (настоящий Element подходит). */
export type PickElement = {
  readonly tagName: string;
  readonly id: string;
  readonly classList: ArrayLike<string>;
  readonly parentElement: PickElement | null;
  readonly previousElementSibling: PickElement | null;
  readonly nextElementSibling: PickElement | null;
  getAttribute(name: string): string | null;
};

/**
 * Проверяет сообщение «элемент выбран».
 *
 * @param data - data из MessageEvent
 */
export function isLamPickedMessage(data: unknown): data is LamPickedMessage {
  return typeof data === 'object' && data !== null && 'lam' in data && data.lam === 'picked' && 'selector' in data && typeof data.selector === 'string';
}

/**
 * Проверяет сообщение «выбор отменён».
 *
 * @param data - data из MessageEvent
 */
export function isLamPickCancelMessage(data: unknown): data is LamPickCancelMessage {
  return typeof data === 'object' && data !== null && 'lam' in data && data.lam === 'pick-cancel';
}

/**
 * Имя компонента по типу fiber: функция, класс, memo, forwardRef.
 *
 * @param type - fiber.type
 * @returns имя или null (DOM-тег, анонимный)
 */
export function componentNameOf(type: unknown): string | null {
  if (typeof type === 'function') {
    const named = type as { displayName?: unknown; name?: unknown };
    const n = typeof named.displayName === 'string' ? named.displayName : typeof named.name === 'string' ? named.name : '';
    return /^[A-Z]/.test(n) ? n : null;
  }
  if (typeof type === 'object' && type !== null) {
    const o = type as { displayName?: unknown; render?: unknown; type?: unknown };
    if (typeof o.displayName === 'string' && o.displayName !== '') {
      return o.displayName;
    }
    return componentNameOf(o.render === undefined ? o.type : o.render);
  }
  return null;
}

/**
 * Место создания JSX из стека React 19 (\`fiber._debugStack.stack\`):
 * первый кадр из исходников приложения, не из node_modules. Позиция — в
 * коде, который отдал dev-сервер (Vite); исходную даёт sourcemap.
 *
 * @param stack - текст стека
 * @returns кадр или null
 */
export function frameFromStack(stack: string): StackFrame | null {
  const lines = stack.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /(?:\(|@|at )((?:https?|file):\/\/[^\s)]+?):(\d+):(\d+)\)?\s*$/.exec(lines[i] ?? '');
    if (m === null) {
      continue;
    }
    let p = '';
    try {
      p = new URL(m[1] ?? '').pathname;
    } catch (e) {
      continue;
    }
    if (p.indexOf('/node_modules/') !== -1 || p.indexOf('/@') === 0 || !/\.(t|j)sx?$/.test(p)) {
      continue;
    }
    return { url: m[1] ?? '', file: decodeURIComponent(p.replace(/^\/+/, '')), line: Number(m[2]), column: Number(m[3]) };
  }
  return null;
}

/**
 * Исходная позиция по sourcemap v3 (VLQ): последний сегмент строки, чей
 * столбец не правее нужного, иначе первый сегмент строки.
 *
 * @param map - sourcemap (sources, mappings)
 * @param line - строка в отданном коде, с 1
 * @param column - столбец, с 1
 */
export function originalPosition(map: { readonly sources: readonly string[]; readonly mappings: string }, line: number, column: number): OriginalPosition | null {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const rows = map.mappings.split(';');
  let src = 0;
  let srcLine = 0;
  let srcCol = 0;
  for (let l = 0; l < rows.length && l < line; l++) {
    let genCol = 0;
    let best: OriginalPosition | null = null;
    let first: OriginalPosition | null = null;
    const segs = (rows[l] ?? '').split(',');
    for (let s = 0; s < segs.length; s++) {
      const seg = segs[s] ?? '';
      if (seg === '') {
        continue;
      }
      const v: number[] = [];
      let shift = 0;
      let value = 0;
      for (let c = 0; c < seg.length; c++) {
        const d = B64.indexOf(seg.charAt(c));
        value += (d & 31) << shift;
        if ((d & 32) !== 0) {
          shift += 5;
        } else {
          v.push((value & 1) === 1 ? -(value >> 1) : value >> 1);
          value = 0;
          shift = 0;
        }
      }
      genCol += v[0] ?? 0;
      if (v.length >= 4) {
        src += v[1] ?? 0;
        srcLine += v[2] ?? 0;
        srcCol += v[3] ?? 0;
        const pos = { source: map.sources[src] ?? '', line: srcLine + 1, column: srcCol + 1 };
        if (first === null) {
          first = pos;
        }
        if (genCol <= column - 1) {
          best = pos;
        }
      }
    }
    if (l === line - 1) {
      return best ?? first;
    }
  }
  return null;
}

/**
 * Переводит кадр в исходную строку: страница сама читает свой модуль у
 * dev-сервера и его встроенную sourcemap.
 *
 * @param frame - кадр стека
 */
export async function mapFrame(frame: StackFrame): Promise<StackSource> {
  try {
    const code = await (await fetch(frame.url)).text();
    const m = /\/\/# sourceMappingURL=(\S+)\s*$/.exec(code);
    if (m === null) {
      return { file: frame.file, line: null };
    }
    const ref = m[1] ?? '';
    let json = '';
    const inline = /^data:application\/json;(?:charset=[^;,]+;)?base64,(.*)$/.exec(ref);
    if (inline !== null) {
      const bin = atob(inline[1] ?? '');
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      json = new TextDecoder().decode(bytes);
    } else {
      json = await (await fetch(new URL(ref, frame.url).href)).text();
    }
    const pos = originalPosition(JSON.parse(json), frame.line, frame.column);
    return { file: frame.file, line: pos === null ? null : pos.line };
  } catch (e) {
    return { file: frame.file, line: null };
  }
}

/**
 * Селектор элемента: id, если он уникален, иначе цепочка «тег.класс:nth-of-type»
 * от ближайшего уникального предка; классы-хэши (CSS-модули) отбрасываются.
 *
 * @param el - элемент
 * @param count - сколько элементов находит селектор (document.querySelectorAll)
 */
export function cssSelectorFor(el: PickElement, count: (selector: string) => number): string {
  const esc = (s: string): string => s.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
  const part = (e: PickElement): string => {
    const tag = e.tagName.toLowerCase();
    if (e.id !== '' && !/\d{3,}/.test(e.id)) {
      return tag + '#' + esc(e.id);
    }
    let base = tag;
    const testId = e.getAttribute('data-testid');
    if (testId !== null && testId !== '') {
      base += '[data-testid="' + testId.replace(/"/g, '\\"') + '"]';
    } else {
      // Два осмысленных класса; утилиты с вариантами (md:, group/x, [..]) и хэши — шум
      let n = 0;
      for (let i = 0; i < e.classList.length && n < 2; i++) {
        const c = e.classList[i] ?? '';
        if (c !== '' && !/[:/[\]()!.%]|[0-9a-f]{5,}|__|_[a-zA-Z0-9]{5}$/.test(c)) {
          base += '.' + esc(c);
          n++;
        }
      }
    }
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
    return twins ? base + ':nth-of-type(' + nth + ')' : base;
  };
  let selector = '';
  for (let e: PickElement | null = el; e !== null && e.tagName.toLowerCase() !== 'html'; e = e.parentElement) {
    selector = selector === '' ? part(e) : part(e) + ' > ' + selector;
    if (count(selector) === 1) {
      return selector;
    }
  }
  return selector === '' ? el.tagName.toLowerCase() : selector;
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
  type Fiber = { type?: unknown; return?: Fiber | null; _debugStack?: { stack?: unknown } | null; _debugSource?: { fileName?: unknown; lineNumber?: unknown } | null };
  const host = fiber as Fiber;
  let source: StackSource | null = null;
  let frame: StackFrame | null = null;
  const ds = host._debugSource;
  if (ds !== undefined && ds !== null && typeof ds.fileName === 'string' && typeof ds.lineNumber === 'number') {
    source = { file: ds.fileName, line: ds.lineNumber };
  } else if (host._debugStack !== undefined && host._debugStack !== null && typeof host._debugStack.stack === 'string') {
    frame = frameFromStack(host._debugStack.stack);
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
    box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #2563eb;background:rgba(37,99,235,.08);border-radius:4px;transition:all .06s ease-out;display:none';
    label = document.createElement('div');
    label.style.cssText = 'position:absolute;left:-2px;bottom:100%;margin-bottom:4px;padding:2px 8px;border-radius:4px;background:#2563eb;color:#fff;font:500 12px/20px system-ui,sans-serif;white-space:nowrap';
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

/**
 * Текст пикера для скрипта страницы: объявления функций и вызов установки.
 */
export function pickerScriptText(): string {
  return [componentNameOf, frameFromStack, originalPosition, mapFrame, cssSelectorFor, domPathOf, reactComponentOf, installPicker]
    .map((f) => f.toString())
    .join('\n') + '\ntry{installPicker();}catch(e){}';
}
