/**
 * Строка markdown одной строкой без выделения — для пунктов 09-bugs и целей эпох.
 */

/** Предел длины строки пункта или цели. */
const LINE_MAX = 240;

/**
 * Строка без markdown-выделения, обрезанная до предела.
 *
 * @param s - строка markdown
 */
export function plain(s: string): string {
  const t = s.replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
  return t.length > LINE_MAX ? `${t.slice(0, LINE_MAX - 1)}…` : t;
}
