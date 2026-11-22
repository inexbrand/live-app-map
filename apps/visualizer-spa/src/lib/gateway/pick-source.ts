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
