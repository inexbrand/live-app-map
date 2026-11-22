/**
 * Сегменты папок Next.js: [id], [...slug], [[...opt]], (group), @slot — в шаблон пути.
 */
import path from 'node:path';

export type SegmentKind =
  | { type: 'static'; name: string }
  | { type: 'dynamic'; name: string }
  | { type: 'catchAll'; name: string }
  | { type: 'optionalCatchAll'; name: string }
  | { type: 'group'; name: string }
  | { type: 'parallel'; name: string }
  | { type: 'intercept'; name: string; mode: string };

/**
 * Парсер имени сегмента App Router.
 */
export function parseSegment(folderName: string): SegmentKind {
  if (folderName.startsWith('@')) {
    return { type: 'parallel', name: folderName.slice(1) };
  }
  const intercept = folderName.match(/^\(\.\.\.\)(.+)$|^\(\.\.\)\.\.(.+)$|^\(\.\.\)(.+)$|^\(\.\)(.+)$/);
  if (folderName.startsWith('(.)')) {
    return { type: 'intercept', name: folderName.slice(3), mode: '(.)' };
  }
  if (folderName.startsWith('(..)(..)')) {
    return { type: 'intercept', name: folderName.slice(8), mode: '(..)(..)' };
  }
  if (folderName.startsWith('(...)')) {
    return { type: 'intercept', name: folderName.slice(5), mode: '(...)' };
  }
  if (folderName.startsWith('(..)')) {
    return { type: 'intercept', name: folderName.slice(4), mode: '(..)' };
  }
  if (folderName.startsWith('(') && folderName.endsWith(')')) {
    return { type: 'group', name: folderName.slice(1, -1) };
  }
  if (folderName.startsWith('[[...') && folderName.endsWith(']]')) {
    return { type: 'optionalCatchAll', name: folderName.slice(5, -2) };
  }
  if (folderName.startsWith('[...') && folderName.endsWith(']')) {
    return { type: 'catchAll', name: folderName.slice(4, -1) };
  }
  if (folderName.startsWith('[') && folderName.endsWith(']')) {
    return { type: 'dynamic', name: folderName.slice(1, -1) };
  }
  void intercept;
  return { type: 'static', name: folderName };
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
  const parts: string[] = [];
  const groups: string[] = [];
  let parallelSlot: string | null = null;
  let intercept: { type: string; targetPathPattern?: string } | null = null;

  for (const s of segments) {
    switch (s.type) {
      case 'static':
        parts.push(s.name);
        break;
      case 'dynamic':
        parts.push(`[${s.name}]`);
        break;
      case 'catchAll':
        parts.push(`[...${s.name}]`);
        break;
      case 'optionalCatchAll':
        parts.push(`[[...${s.name}]]`);
        break;
      case 'group':
        groups.push(s.name);
        break;
      case 'parallel':
        parallelSlot = s.name;
        break;
      case 'intercept':
        intercept = { type: s.mode };
        parts.push(s.name);
        break;
      default:
        break;
    }
  }
  const pattern = parts.length === 0 ? '/' : `/${parts.join('/')}`;
  return { pattern, groups, parallelSlot, intercept };
}
