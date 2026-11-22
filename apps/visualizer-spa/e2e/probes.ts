/**
 * Замеры раскладки для e2e. Функции «в браузере» передаются в page.evaluate и потому
 * самодостаточны (не зовут ничего из модуля); расчёты по замерам — чистые функции.
 */

/** Прямоугольник на экране. */
export type Rect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/** Видимый элемент панели: края, связанные (вложенные) элементы, перекрыт ли сверху. */
export type LayoutItem = {
  readonly name: string;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  /** Индексы элементов, которые содержат этот или содержатся в нём (включая его самого). */
  readonly related: readonly number[];
  readonly covered: boolean;
};

/** Итог замера: что видно, какие пары наезжают, что перекрыто. */
export type Probe = { readonly shown: string[]; readonly overlaps: string[]; readonly covered: string[] };

/**
 * В браузере: видимые элементы по селекторам (имя — `селектор[номер]`).
 *
 * @param sel - селекторы панелей
 * @returns элементы с краями и связями
 */
export function layoutItems(sel: readonly string[]): LayoutItem[] {
  const els = sel
    .flatMap((s) => [...document.querySelectorAll(s)].map((el, i) => ({ name: `${s}[${i}]`, el, r: el.getBoundingClientRect() })))
    .filter((e) => e.r.width > 0 && e.r.height > 0);
  return els.map(({ name, el, r }) => {
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 20));
    return {
      name,
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      related: els.flatMap((o, j) => (o.el.contains(el) || el.contains(o.el) ? [j] : [])),
      covered: top !== null && !el.contains(top),
    };
  });
}

/** Прямоугольники пересекаются больше чем на 1 px. */
export function intersects(a: LayoutItem, b: LayoutItem): boolean {
  return a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
}

/**
 * Наложения несвязанных элементов и перекрытые элементы.
 *
 * @param items - замер из layoutItems
 * @returns итог замера
 */
export function probeOf(items: readonly LayoutItem[]): Probe {
  const overlaps = items.flatMap((a, i) =>
    items.slice(i + 1).flatMap((b, k) => (!a.related.includes(i + 1 + k) && intersects(a, b) ? [`${a.name} × ${b.name}`] : [])),
  );
  return { shown: items.map((e) => e.name), overlaps, covered: items.filter((e) => e.covered).map((e) => e.name) };
}

/** Сырые данные мини-карты и холста из браузера. */
export type MiniRaw = {
  readonly box: Rect;
  readonly svg: Rect;
  readonly flow: Rect;
  readonly viewBox: string;
  readonly transform: string;
  readonly nodes: readonly { readonly rect: Rect; readonly frame: boolean; readonly fill: string }[];
};

/**
 * В браузере: прямоугольники мини-карты, её SVG и холста, viewBox, transform вьюпорта, ноды.
 *
 * @returns сырые данные; нет мини-карты или холста — ошибка
 */
export function minimapRaw(): MiniRaw {
  const rect = (r: DOMRect): Rect => ({ x: r.x, y: r.y, w: r.width, h: r.height });
  const box = document.querySelector('.react-flow__minimap');
  const svg = box?.querySelector('svg');
  const flow = document.querySelector('.react-flow');
  const vpEl = document.querySelector<HTMLElement>('.react-flow__viewport');
  if (!box || !svg || !flow || !vpEl) {
    throw new Error('нет мини-карты или холста');
  }
  return {
    box: rect(box.getBoundingClientRect()),
    svg: rect(svg.getBoundingClientRect()),
    flow: rect(flow.getBoundingClientRect()),
    viewBox: svg.getAttribute('viewBox') ?? '',
    transform: getComputedStyle(vpEl).transform,
    nodes: [...svg.querySelectorAll('.react-flow__minimap-node')].map((n) => ({
      rect: rect(n.getBoundingClientRect()),
      frame: n.classList.contains('lam-minimap-frame'),
      fill: getComputedStyle(n).fill,
    })),
  };
}

/**
 * Масштаб и сдвиг из `matrix(a, b, c, d, e, f)`; `none` — тождественное преобразование.
 *
 * @param transform - вычисленный transform
 * @returns зум и сдвиг
 */
export function matrixOf(transform: string): { readonly zoom: number; readonly tx: number; readonly ty: number } {
  const v = /^matrix\(([^)]+)\)$/.exec(transform.trim())?.[1]?.split(',').map(Number) ?? [];
  return { zoom: v[0] ?? 1, tx: v[4] ?? 0, ty: v[5] ?? 0 };
}

/** viewBox `x y w h`; нет значения — 0. */
export function viewBoxOf(text: string): Rect {
  const [x = 0, y = 0, w = 0, h = 0] = text.split(/\s+/).map(Number);
  return { x, y, w, h };
}

/**
 * В браузере: первая нода холста, видимая целиком под шапкой, и точка клика по её шапке.
 *
 * @param els - ноды React Flow
 * @returns точка и id ноды или null
 */
export function firstNodeInView(els: readonly Element[]): { x: number; y: number; id: string } | null {
  const found = els
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .find(({ r }) => r.x >= 0 && r.y >= 70 && r.right < window.innerWidth && r.y + 20 < window.innerHeight);
  return found === undefined ? null : { x: found.r.x + Math.min(20, found.r.width / 2), y: found.r.y + 12, id: found.el.getAttribute('data-id') ?? '' };
}

/** В браузере: левый и правый края панелей. */
export function drawerEdges(els: readonly Element[]): { left: number; right: number }[] {
  return els.map((e) => {
    const r = e.getBoundingClientRect();
    return { left: r.left, right: r.right };
  });
}

/** Полоса экрана между панелями: левые панели задают левый край, правые — правый. */
export type FreeBand = { readonly left: number; readonly right: number };

/**
 * Свободная полоса экрана по краям панелей.
 *
 * @param drawers - края панелей
 * @param width - ширина окна
 * @returns полоса
 */
export function freeBand(drawers: readonly { left: number; right: number }[], width: number): FreeBand {
  return {
    left: Math.max(0, ...drawers.filter((d) => d.left < width / 2).map((d) => d.right)),
    right: Math.min(width, ...drawers.filter((d) => d.left > width / 2).map((d) => d.left)),
  };
}

/** Прямоугольник внутри другого с допуском slack px. */
export function inside(r: Rect, outer: Rect, slack = 1): boolean {
  return r.x >= outer.x - slack && r.y >= outer.y - slack && r.x + r.w <= outer.x + outer.w + slack && r.y + r.h <= outer.y + outer.h + slack;
}

/** В браузере: scrollTop элемента по селектору; нет элемента — -1. */
export function scrollTopOf(selector: string): number {
  return document.querySelector(selector)?.scrollTop ?? -1;
}

/** В браузере: снять фокус с активного элемента (горячие клавиши не уходят в поле). */
export function blurActive(): void {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

/** Ответ tools/call MCP. */
export type McpReply = { readonly result: { readonly content: readonly { readonly text: string }[] } };

/**
 * JSON из текста первого блока ответа инструмента MCP; блока нет — пустой объект.
 *
 * @param body - ответ JSON-RPC
 * @returns разобранный JSON
 */
export function mcpResult(body: McpReply): Record<string, unknown> {
  return JSON.parse(body.result.content[0]?.text ?? '{}');
}

/** Прямоугольник Playwright. */
export type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** Компонент заметного размера целиком в свободной полосе, ниже шапки и в окне. */
export function isClickable(b: Box, band: FreeBand, height: number): boolean {
  return b.width > 20 && b.height > 10 && b.x > band.left && b.y > 80 && b.x + b.width < band.right && b.y + b.height < height;
}

/**
 * Точка клика по первому доступному компоненту.
 *
 * @param boxes - прямоугольники компонентов (null — не на экране)
 * @param band - свободная полоса
 * @param height - высота окна
 * @returns центр компонента (не ниже 12 px от верха) или undefined
 */
export function firstClickable(boxes: readonly (Box | null)[], band: FreeBand, height: number): { x: number; y: number } | undefined {
  const b = boxes.find((x): x is Box => x !== null && isClickable(x, band, height));
  return b === undefined ? undefined : { x: b.x + b.width / 2, y: b.y + Math.min(b.height / 2, 12) };
}
