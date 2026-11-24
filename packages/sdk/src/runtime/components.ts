/**
 * Дерево React-компонентов страницы для `window.__LAM__.components()`.
 *
 * Функции встраиваются в страницу текстом (toString): без импортов значений и
 * замыканий, друг друга зовут по имени (componentNameOf, debugPlaceOf — из fiber.ts).
 */
import type { Fiber, StackSource } from './fiber';
import { componentNameOf, debugPlaceOf } from './fiber';

/** Рамка на экране, px от левого верхнего угла окна. */
export type LamRect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** Компонент на странице. */
export type LamComponentInfo = {
  /** Имя: VacancyCard. */
  readonly name: string;
  /** Глубина среди компонентов (корень — 0). */
  readonly depth: number;
  /** Имя ближайшего компонента-родителя. */
  readonly parent: string | null;
  /** Файл, где компонент написан (из JSX, который он создал): src/features/feed/VacancyCard.tsx. */
  readonly file: string | null;
  /** Где его вызвали (JSX `<VacancyCard/>`): файл и строка (строка — только React 18). */
  readonly usedAt: StackSource | null;
  /** Рамка: объединение верхних DOM-узлов; не рисуется — null. */
  readonly rect: LamRect | null;
};

/** Место JSX одного fiber как StackSource: _debugSource или кадр стека (строка в коде Vite неизвестна). */
export function lamPlaceSource(f: Fiber): StackSource | null {
  const p = debugPlaceOf(f);
  if (p.source !== null) {
    return p.source;
  }
  return p.frame === null ? null : { file: p.frame.file, line: null };
}

/**
 * Файл компонента: место JSX первого потомка, чей владелец — этот компонент
 * (React записывает в потомка стек вызова из тела компонента).
 */
export function lamOwnFileOf(f: Fiber): string | null {
  const queue: Fiber[] = [];
  if (f.child !== undefined && f.child !== null) {
    queue.push(f.child);
  }
  for (let n = 0; queue.length > 0 && n < 400; n++) {
    const g = queue.shift();
    if (g === undefined) {
      break;
    }
    if (g._debugOwner === f || (f.alternate !== undefined && f.alternate !== null && g._debugOwner === f.alternate)) {
      const s = lamPlaceSource(g);
      if (s !== null) {
        return s.file;
      }
    }
    if (g.child !== undefined && g.child !== null) {
      queue.push(g.child);
    }
    if (g.sibling !== undefined && g.sibling !== null) {
      queue.push(g.sibling);
    }
  }
  return null;
}

/** Рамка компонента: объединение рамок ближайших DOM-элементов под ним. */
export function lamRectOf(f: Fiber): LamRect | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const stack: Fiber[] = [];
  if (f.child !== undefined && f.child !== null) {
    stack.push(f.child);
  }
  for (let n = 0; stack.length > 0 && n < 2000; n++) {
    const g = stack.pop();
    if (g === undefined) {
      break;
    }
    if (g.sibling !== undefined && g.sibling !== null) {
      stack.push(g.sibling);
    }
    const node = g.stateNode;
    if (typeof Element !== 'undefined' && node instanceof Element) {
      const r = node.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) {
        left = Math.min(left, r.left);
        top = Math.min(top, r.top);
        right = Math.max(right, r.right);
        bottom = Math.max(bottom, r.bottom);
      }
    } else if (g.child !== undefined && g.child !== null) {
      stack.push(g.child);
    }
  }
  return left === Infinity ? null : { x: left, y: top, width: right - left, height: bottom - top };
}

/** Корни React в документе: текущее дерево каждого контейнера createRoot. */
export function lamRootFibers(doc: Document): Fiber[] {
  const out: Fiber[] = [];
  const all = doc.querySelectorAll('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i] as unknown as Record<string, unknown>;
    const keys = Object.keys(el);
    for (let k = 0; k < keys.length; k++) {
      const key = keys[k] ?? '';
      const v = key.indexOf('__reactContainer$') === 0 ? el[key] : null;
      if (typeof v === 'object' && v !== null) {
        const host = v as Fiber;
        const root = host.stateNode as { current?: Fiber } | null | undefined;
        out.push(root !== null && root !== undefined && root.current !== undefined ? root.current : host);
      }
    }
  }
  return out;
}

/**
 * Компоненты страницы в порядке дерева: имя, файл, место вызова, рамка.
 * Обёртка memo/forwardRef с тем же именем, что у вложенного, не повторяется.
 *
 * @param doc - документ страницы
 */
export function lamComponents(doc: Document): LamComponentInfo[] {
  const out: LamComponentInfo[] = [];
  const roots = lamRootFibers(doc);
  const stack: { readonly f: Fiber; readonly depth: number; readonly parent: string | null }[] = [];
  for (let i = roots.length - 1; i >= 0; i--) {
    const r = roots[i];
    if (r !== undefined && r.child !== undefined && r.child !== null) {
      stack.push({ f: r.child, depth: 0, parent: null });
    }
  }
  while (stack.length > 0 && out.length < 5000) {
    const top = stack.pop();
    if (top === undefined) {
      break;
    }
    const f = top.f;
    if (f.sibling !== undefined && f.sibling !== null) {
      stack.push({ f: f.sibling, depth: top.depth, parent: top.parent });
    }
    const name = typeof f.stateNode === 'object' && f.stateNode !== null && typeof Element !== 'undefined' && f.stateNode instanceof Element ? null : componentNameOf(f.type);
    const own = name !== null && name !== top.parent;
    if (own && name !== null) {
      out.push({ name, depth: top.depth, parent: top.parent, file: lamOwnFileOf(f), usedAt: lamPlaceSource(f), rect: lamRectOf(f) });
    }
    if (f.child !== undefined && f.child !== null) {
      stack.push({ f: f.child, depth: own ? top.depth + 1 : top.depth, parent: own ? name : top.parent });
    }
  }
  return out;
}
