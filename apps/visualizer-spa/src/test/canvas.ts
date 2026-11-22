/**
 * Контекст canvas для тестов: записывает вызовы рисования и присваивания стилей
 * строками журнала — по ним видно, что и в каком порядке нарисовано.
 */

/** Журнал рисования: «метод(аргументы)» и «свойство=значение». */
export type DrawLog = string[];

function fmt(v: unknown): string {
  return typeof v === 'number' ? String(Math.round(v * 100) / 100) : JSON.stringify(v);
}

/**
 * Записывающий 2D-контекст: только то, чем рисует граф документации.
 * Ширина текста — 6 px на символ (как у моноширинного 12px), чтобы раскладка подписей была детерминированной.
 */
export class RecordingContext {
  readonly log: DrawLog = [];
  private readonly props = new Map<string, unknown>();

  private call(name: string, args: readonly unknown[]): void {
    this.log.push(`${name}(${args.map(fmt).join(',')})`);
  }

  private setProp(name: string, v: unknown): void {
    this.props.set(name, v);
    this.log.push(`${name}=${fmt(v)}`);
  }

  get lineWidth(): number { return Number(this.props.get('lineWidth') ?? 1); }
  set lineWidth(v: number) { this.setProp('lineWidth', v); }
  get globalAlpha(): number { return Number(this.props.get('globalAlpha') ?? 1); }
  set globalAlpha(v: number) { this.setProp('globalAlpha', v); }
  get strokeStyle(): string { return String(this.props.get('strokeStyle') ?? ''); }
  set strokeStyle(v: string) { this.setProp('strokeStyle', v); }
  get fillStyle(): string { return String(this.props.get('fillStyle') ?? ''); }
  set fillStyle(v: string) { this.setProp('fillStyle', v); }
  get font(): string { return String(this.props.get('font') ?? ''); }
  set font(v: string) { this.setProp('font', v); }
  get textAlign(): CanvasTextAlign { return 'center'; }
  set textAlign(v: CanvasTextAlign) { this.setProp('textAlign', v); }
  get textBaseline(): CanvasTextBaseline { return 'top'; }
  set textBaseline(v: CanvasTextBaseline) { this.setProp('textBaseline', v); }
  get lineJoin(): CanvasLineJoin { return 'round'; }
  set lineJoin(v: CanvasLineJoin) { this.setProp('lineJoin', v); }

  clearRect(...a: [number, number, number, number]): void { this.call('clearRect', a); }
  setTransform(...a: [number, number, number, number, number, number]): void { this.call('setTransform', a); }
  setLineDash(a: number[]): void { this.call('setLineDash', [a]); }
  beginPath(): void { this.call('beginPath', []); }
  closePath(): void { this.call('closePath', []); }
  moveTo(...a: [number, number]): void { this.call('moveTo', a); }
  lineTo(...a: [number, number]): void { this.call('lineTo', a); }
  rect(...a: [number, number, number, number]): void { this.call('rect', a); }
  roundRect(...a: [number, number, number, number, number]): void { this.call('roundRect', a); }
  arc(...a: [number, number, number, number, number]): void { this.call('arc', a); }
  fill(): void { this.call('fill', []); }
  stroke(): void { this.call('stroke', []); }
  strokeText(...a: [string, number, number]): void { this.call('strokeText', a); }
  fillText(...a: [string, number, number]): void { this.call('fillText', a); }
  drawImage(_image: CanvasImageSource, ...a: number[]): void { this.call('drawImage', a); }
  measureText(text: string): { readonly width: number } { return { width: text.length * 6 }; }
}
/**
 * Холст для тестов: canvas рисует в записывающий контекст, размер 800×600,
 * prefers-reduced-motion — как задано (раскладка без анимации — сразу целиком).
 *
 * @returns контекст с журналом и возврат настоящих методов
 */
export function installCanvas(reducedMotion: boolean): { readonly ctx: RecordingContext; readonly restore: () => void } {
  const ctx = new RecordingContext();
  const proto = HTMLCanvasElement.prototype;
  const saved = { getContext: proto.getContext, rect: proto.getBoundingClientRect, matchMedia: window.matchMedia };
  Reflect.set(proto, 'getContext', () => ctx);
  proto.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 600 });
  window.matchMedia = (query: string): MediaQueryList => {
    const list = saved.matchMedia.call(window, query);
    return Object.defineProperty(list, 'matches', { value: reducedMotion && query.includes('reduce') });
  };
  return {
    ctx,
    restore: () => {
      Reflect.set(proto, 'getContext', saved.getContext);
      proto.getBoundingClientRect = saved.rect;
      window.matchMedia = saved.matchMedia;
    },
  };
}

/** Последний кадр журнала: всё после последнего clearRect. */
export function lastFrame(log: DrawLog): DrawLog {
  const i = log.map((x) => x.startsWith('clearRect(')).lastIndexOf(true);
  return i < 0 ? [] : log.slice(i);
}

/** Центры кругов последнего кадра (эпохи и файлы эпох рисуются кругами). */
export function circleCenters(log: DrawLog): { readonly x: number; readonly y: number }[] {
  return lastFrame(log).flatMap((e) => {
    const m = /^arc\((-?[\d.]+),(-?[\d.]+),/.exec(e);
    return m === null ? [] : [{ x: Number(m[1]), y: Number(m[2]) }];
  });
}
