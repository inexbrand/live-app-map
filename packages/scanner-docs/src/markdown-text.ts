/**
 * Разбор markdown-текста эпохи: заголовок, цель из 00-brief, статус из INDEX.md,
 * открытые пункты 09-bugs.
 */
import { bugItems } from './bug-items';

/** Предел длины строки пункта или цели. */
const LINE_MAX = 240;


const HEADING = /^(#{1,6})\s+(.*)$/;

/**
 * Строки вне блоков кода ```.
 *
 * @param text - markdown
 * @returns строки без содержимого блоков кода
 */
function proseLines(text: string): string[] {
  let fenced = false;
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced) {
      out.push(line);
    }
  }
  return out;
}

/** Строка без markdown-выделения, обрезанная до предела. */
function plain(s: string): string {
  const t = s.replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
  return t.length > LINE_MAX ? `${t.slice(0, LINE_MAX - 1)}…` : t;
}

/**
 * Заголовок документа: первый `# …`.
 *
 * @param text - markdown
 * @returns текст заголовка или undefined
 */
export function firstHeading(text: string): string | undefined {
  for (const line of proseLines(text)) {
    const m = /^#\s+(.+)$/.exec(line.trim());
    if (m?.[1] !== undefined) {
      return plain(m[1]);
    }
  }
  return undefined;
}

/**
 * Открытые пункты 09-bugs одной строкой каждый (разбор — {@link bugItems}).
 *
 * @param text - текст 09-bugs
 * @returns пункты одной строкой
 */
export function openBugItems(text: string): string[] {
  return bugItems(text)
    .filter((b) => b.state === 'open')
    .map((b) => b.text);
}

/**
 * Статус из INDEX.md: значение строки `Status: …`.
 *
 * @param text - INDEX.md
 * @returns статус или undefined
 */
export function declaredStatus(text: string): string | undefined {
  const m = /^\s*[-*]?\s*(?:Status|Статус)\s*:\s*(.+)$/im.exec(text);
  return m?.[1] === undefined ? undefined : plain(m[1]);
}

/** Шаблонный текст каркаса эпохи, а не цель. */
const PLACEHOLDER = /^\(?заполнить/i;

/**
 * Цель задачи из 00-brief: первый абзац раздела «Цель», иначе первый абзац текста.
 *
 * @param text - 00-brief
 * @returns строка или undefined
 */
export function briefSummary(text: string): string | undefined {
  const lines = proseLines(text);
  const goal = lines.findIndex((l) => /^#{2,6}\s*(цель|goal)/i.test(l.trim()));
  const from = goal >= 0 ? goal + 1 : 0;
  const para: string[] = [];
  for (const line of lines.slice(from)) {
    const t = line.trim();
    if (HEADING.test(t) || t.startsWith('@epoch')) {
      if (para.length > 0 || goal >= 0) {
        break;
      }
      continue;
    }
    if (t === '') {
      if (para.length > 0) {
        break;
      }
      continue;
    }
    para.push(t);
  }
  const s = plain(para.join(' '));
  return s === '' || PLACEHOLDER.test(s) ? undefined : s;
}
