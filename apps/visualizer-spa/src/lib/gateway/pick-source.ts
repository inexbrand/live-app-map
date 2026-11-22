/**
 * Пикер, сторона исходника: имя компонента React, кадр стека, позиция по source map.
 *
 * Функции встраиваются в скрипт страницы как текст (toString, pick-script.ts): без
 * замыканий, друг друга зовут по имени; импорты здесь — только для проверки типов.
 */
import type { OriginalPosition, StackFrame, StackSource } from './pick-messages';

/**
 * Имя компонента по типу fiber: функция, класс, memo, forwardRef.
 *
 * @param type - fiber.type
 * @returns имя или null (DOM-тег, анонимный)
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

/**
 * Исходная позиция по sourcemap v3 (VLQ): последний сегмент строки, чей
 * столбец не правее нужного, иначе первый сегмент строки.
 *
 * @param map - sourcemap (sources, mappings)
 * @param line - строка в отданном коде, с 1
 * @param column - столбец, с 1
 */
export function originalPosition(map: { readonly sources: readonly string[]; readonly mappings: string }, line: number, column: number): OriginalPosition | null {
  const rows = map.mappings.split(';');
  // Поля сегментов — дельты от предыдущего сегмента всей карты, не строки
  const acc = { src: 0, line: 0, col: 0 };
  for (let l = 0; l < rows.length && l < line; l++) {
    const hit = scanMappingRow(map.sources, rows[l] ?? '', acc, column);
    if (l === line - 1) {
      return hit;
    }
  }
  return null;
}

/**
 * Строка mappings: позиция последнего сегмента не правее column, иначе первого.
 *
 * @param acc - накопленные source/строка/колонка (меняется)
 */
export function scanMappingRow(sources: readonly string[], row: string, acc: { src: number; line: number; col: number }, column: number): OriginalPosition | null {
  let genCol = 0;
  let best: OriginalPosition | null = null;
  let first: OriginalPosition | null = null;
  for (const seg of row.split(',')) {
    const v = seg === '' ? [] : decodeVlq(seg);
    genCol += v[0] ?? 0;
    const pos = v.length >= 4 ? advanceMapping(sources, v, acc) : null;
    first = first ?? pos;
    if (pos !== null && genCol <= column - 1) {
      best = pos;
    }
  }
  return best ?? first;
}

/** Сдвиг source/строки/колонки на дельты сегмента; позиция с 1. */
export function advanceMapping(sources: readonly string[], v: readonly number[], acc: { src: number; line: number; col: number }): OriginalPosition {
  acc.src += v[1] ?? 0;
  acc.line += v[2] ?? 0;
  acc.col += v[3] ?? 0;
  return { source: sources[acc.src] ?? '', line: acc.line + 1, column: acc.col + 1 };
}

/** Числа сегмента base64-VLQ. */
export function decodeVlq(seg: string): number[] {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
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
  return v;
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
