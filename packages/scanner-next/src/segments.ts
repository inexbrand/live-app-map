/**
 * Сегменты папок Next.js: [id], [...slug], [[...opt]], (group), @slot — в шаблон пути.
 */

export type SegmentKind =
  | { type: 'static'; name: string }
  | { type: 'dynamic'; name: string }
  | { type: 'catchAll'; name: string }
  | { type: 'optionalCatchAll'; name: string }
  | { type: 'group'; name: string }
  | { type: 'parallel'; name: string }
  | { type: 'intercept'; name: string; mode: string };

/** Режимы перехвата: длинный (..)(..) — раньше (..). */
const INTERCEPT_MODES = ['(.)', '(..)(..)', '(...)', '(..)'];

/** Сегменты в скобках: открытие, закрытие, вид. */
const WRAPPED: readonly [string, string, 'group' | 'optionalCatchAll' | 'catchAll' | 'dynamic'][] = [
  ['(', ')', 'group'],
  ['[[...', ']]', 'optionalCatchAll'],
  ['[...', ']', 'catchAll'],
  ['[', ']', 'dynamic'],
];

/**
 * Парсер имени сегмента App Router.
 */
export function parseSegment(folderName: string): SegmentKind {
  if (folderName.startsWith('@')) {
    return { type: 'parallel', name: folderName.slice(1) };
  }
  const mode = INTERCEPT_MODES.find((m) => folderName.startsWith(m));
  if (mode !== undefined) {
    return { type: 'intercept', name: folderName.slice(mode.length), mode };
  }
  const wrapped = WRAPPED.find(([open, close]) => folderName.startsWith(open) && folderName.endsWith(close));
  if (wrapped === undefined) {
    return { type: 'static', name: folderName };
  }
  const [open, close, type] = wrapped;
  return { type, name: folderName.slice(open.length, -close.length) };
}

/** Часть пути сегмента; группы и слоты пути не меняют. */
function pathPart(s: SegmentKind): string[] {
  switch (s.type) {
    case 'static':
    case 'intercept':
      return [s.name];
    case 'dynamic':
      return [`[${s.name}]`];
    case 'catchAll':
      return [`[...${s.name}]`];
    case 'optionalCatchAll':
      return [`[[...${s.name}]]`];
    default:
      return [];
  }
}

/**
 * Строит path pattern из списка сегментов (posix, с /).
 */
export function segmentsToPattern(segments: readonly SegmentKind[]): {
  pattern: string;
  groups: string[];
  parallelSlot: string | null;
  intercept: { type: string; targetPathPattern?: string } | null;
} {
  const parts = segments.flatMap(pathPart);
  const groups = segments.flatMap((s) => (s.type === 'group' ? [s.name] : []));
  const slot = segments.flatMap((s) => (s.type === 'parallel' ? [s.name] : [])).at(-1);
  const mode = segments.flatMap((s) => (s.type === 'intercept' ? [s.mode] : [])).at(-1);
  return {
    pattern: parts.length === 0 ? '/' : `/${parts.join('/')}`,
    groups,
    parallelSlot: slot ?? null,
    intercept: mode === undefined ? null : { type: mode },
  };
}