/**
 * Чтение fiber React в dev: имя компонента, место JSX (React 18 — `_debugSource`,
 * React 19 — `_debugStack`), кадр стека из кода приложения.
 *
 * Функции встраиваются в страницу текстом (toString): без импортов значений и
 * замыканий, друг друга зовут по имени. Их же встраивает пикер визуализатора.
 */

/** Кадр стека в модуле приложения: адрес модуля, путь, позиция в отданном коде. */
export type StackFrame = { readonly url: string; readonly file: string; readonly line: number; readonly column: number };

/** Место в исходнике: файл и строка (строка неизвестна — null). */
export type StackSource = { readonly file: string; readonly line: number | null };

/** Узел fiber React: только поля, которые читают SDK и пикер. */
export type Fiber = {
  tag?: number;
  type?: unknown;
  stateNode?: unknown;
  child?: Fiber | null;
  sibling?: Fiber | null;
  return?: Fiber | null;
  alternate?: Fiber | null;
  _debugOwner?: Fiber | null;
  _debugStack?: { stack?: unknown } | null;
  _debugSource?: { fileName?: unknown; lineNumber?: unknown } | null;
};

/** Место JSX: исходник (React 18) или кадр стека (React 19). */
export type DebugPlace = { readonly source: StackSource | null; readonly frame: StackFrame | null };

/**
 * Имя компонента по типу fiber: функция, класс, memo, forwardRef.
 *
 * @param type - fiber.type
 * @returns имя или null (DOM-тег, анонимный, контекст)
 */
export function componentNameOf(type: unknown): string | null {
  if (typeof type === 'function') {
    return functionComponentName(type);
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

/** Имя функции-компонента: displayName, иначе name; с заглавной — компонент, иначе null. */
export function functionComponentName(fn: object): string | null {
  const named = fn as { displayName?: unknown; name?: unknown };
  const n = typeof named.displayName === 'string' ? named.displayName : typeof named.name === 'string' ? named.name : '';
  return /^[A-Z]/.test(n) ? n : null;
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
    const f = appFrameOf(lines[i] ?? '');
    if (f !== null) {
      return f;
    }
  }
  return null;
}

/** Кадр строки стека, если это модуль приложения (не node_modules, не /@vite, ts/js). */
export function appFrameOf(line: string): StackFrame | null {
  const m = /(?:\(|@|at )((?:https?|file):\/\/[^\s)]+?):(\d+):(\d+)\)?\s*$/.exec(line);
  if (m === null) {
    return null;
  }
  let p = '';
  try {
    p = new URL(m[1] ?? '').pathname;
  } catch (e) {
    return null;
  }
  if (p.indexOf('/node_modules/') !== -1 || p.indexOf('/@') === 0 || !/\.(t|j)sx?$/.test(p)) {
    return null;
  }
  return { url: m[1] ?? '', file: decodeURIComponent(p.replace(/^\/+/, '')), line: Number(m[2]), column: Number(m[3]) };
}

/** Fiber React DOM-элемента (свойство `__reactFiber$…`); не React — null. */
export function fiberOf(el: Element): Fiber | null {
  const rec = el as unknown as Record<string, unknown>;
  const key = Object.keys(rec).find((k) => k.indexOf('__reactFiber$') === 0);
  const fiber = key === undefined ? null : rec[key];
  return typeof fiber === 'object' && fiber !== null ? (fiber as Fiber) : null;
}

/** Место JSX одного fiber: _debugSource вне node_modules или стек _debugStack. */
export function debugPlaceOf(f: Fiber): DebugPlace {
  const ds = f._debugSource;
  if (ds !== undefined && ds !== null && typeof ds.fileName === 'string' && typeof ds.lineNumber === 'number') {
    return { source: ds.fileName.indexOf('/node_modules/') === -1 ? { file: ds.fileName, line: ds.lineNumber } : null, frame: null };
  }
  const stack = f._debugStack;
  return { source: null, frame: stack !== undefined && stack !== null && typeof stack.stack === 'string' ? frameFromStack(stack.stack) : null };
}
