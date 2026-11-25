/**
 * Sourcemap v3 в странице: позиция в исходнике по позиции в отданном коде.
 * Общая для пикера визуализатора и `window.__LAM__.components()`: в сборке для
 * карты кадр стека указывает на бандл, а файл компонента берётся из карты.
 *
 * Функции встраиваются в страницу текстом (toString): без импортов значений и
 * замыканий, друг друга зовут по имени.
 */

/** Позиция в исходнике: путь из sources карты, строка и столбец с 1. */
export type OriginalPosition = { readonly source: string; readonly line: number; readonly column: number };

/** Карта: только поля, которые читаем. */
export type LamSourceMap = { readonly sources: readonly string[]; readonly mappings: string };

/** Накопленные source, строка и колонка исходника на начало строки mappings. */
export type MappingAcc = { src: number; line: number; col: number };

/** Карта с накопителями на начало каждой строки: поиск читает одну строку, а не всё с начала. */
export type LamMapIndex = { readonly sources: readonly string[]; readonly rows: readonly string[]; readonly starts: readonly MappingAcc[] };

/**
 * Исходная позиция по sourcemap v3 (VLQ): последний сегмент строки, чей
 * столбец не правее нужного, иначе первый сегмент строки.
 *
 * @param map - sourcemap (sources, mappings)
 * @param line - строка в отданном коде, с 1
 * @param column - столбец, с 1
 */
export function originalPosition(map: LamSourceMap, line: number, column: number): OriginalPosition | null {
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
export function scanMappingRow(sources: readonly string[], row: string, acc: MappingAcc, column: number): OriginalPosition | null {
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
export function advanceMapping(sources: readonly string[], v: readonly number[], acc: MappingAcc): OriginalPosition {
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
 * Индекс карты: один проход по mappings.
 *
 * @param map - sourcemap
 */
export function lamIndexMap(map: LamSourceMap): LamMapIndex {
  const rows = map.mappings.split(';');
  const acc: MappingAcc = { src: 0, line: 0, col: 0 };
  const starts: MappingAcc[] = [];
  for (let l = 0; l < rows.length; l++) {
    starts.push({ src: acc.src, line: acc.line, col: acc.col });
    scanMappingRow(map.sources, rows[l] ?? '', acc, Infinity);
  }
  return { sources: map.sources, rows, starts };
}

/**
 * Позиция по индексу карты.
 *
 * @param ix - индекс (lamIndexMap)
 * @param line - строка в отданном коде, с 1
 * @param column - столбец, с 1
 */
export function lamIndexedPosition(ix: LamMapIndex, line: number, column: number): OriginalPosition | null {
  const start = ix.starts[line - 1];
  if (start === undefined) {
    return null;
  }
  return scanMappingRow(ix.sources, ix.rows[line - 1] ?? '', { src: start.src, line: start.line, col: start.col }, column);
}

/** Кадр из собранного бандла (js), а не из модуля исходника dev-сервера (tsx, ts, jsx). */
export function lamIsBundleFile(file: string): boolean {
  return /\.m?js$/.test(file);
}

/**
 * Путь исходника от корня сайта: source карты относительно адреса карты.
 * Лишние «..» упираются в корень адреса — путь выходит как у dev-сервера: src/ui/Card.tsx.
 *
 * @param source - элемент sources
 * @param mapUrl - адрес карты
 */
export function lamBundleSource(source: string, mapUrl: string): string {
  return decodeURIComponent(new URL(source, mapUrl).pathname.replace(/^\/+/, ''));
}

/** Карты бандлов страницы: адрес скрипта → индекс; 'loading' — ещё читается, null — карты нет. */
type LamMapCache = Record<string, LamMapIndex | 'loading' | null>;

/**
 * Индекс карты скрипта, если уже прочитан; иначе начинает чтение `<адрес>.map` и отдаёт null.
 * Синхронно: components() зовут без await, карту успевают прочитать при загрузке страницы.
 *
 * @param url - адрес скрипта
 */
export function lamMapFor(url: string): LamMapIndex | null {
  const w = window as unknown as { __LAM_MAPS__?: LamMapCache };
  const cache: LamMapCache = w.__LAM_MAPS__ ?? {};
  w.__LAM_MAPS__ = cache;
  const hit = cache[url];
  if (hit !== undefined) {
    return hit === 'loading' ? null : hit;
  }
  cache[url] = 'loading';
  fetch(url + '.map')
    .then((r) => (r.ok ? r.json() : null))
    .then((m: unknown) => {
      const map = m as { sources?: unknown; mappings?: unknown } | null;
      cache[url] = map !== null && Array.isArray(map.sources) && typeof map.mappings === 'string' ? lamIndexMap({ sources: map.sources as string[], mappings: map.mappings }) : null;
    })
    .catch(() => {
      cache[url] = null;
    });
  return null;
}

/**
 * Кадр бандла из кода библиотеки (по карте — из node_modules). Карта ещё не
 * прочитана — false: кадр берём как есть, следующий вызов уже знает.
 *
 * @param url - адрес скрипта кадра
 * @param line - строка, с 1
 * @param column - столбец, с 1
 */
export function lamBundleFrameInLibrary(url: string, line: number, column: number): boolean {
  const ix = lamMapFor(url);
  const pos = ix === null ? null : lamIndexedPosition(ix, line, column);
  return pos !== null && pos.source.indexOf('node_modules') !== -1;
}
