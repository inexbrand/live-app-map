/**
 * Пункты 09-bugs эпохи: разбор (открыт, закрыт, вне разделов) и переключение
 * состояния с правкой самого markdown. Без node — работает и в браузере.
 *
 * Открытые: неотмеченные чекбоксы `- [ ]` где угодно и пункты верхнего уровня
 * раздела «Open»/«Открытые» (кроме `[закрыт]`, зачёркнутых, заглушек).
 * Закрытые: `- [x]`, пункты раздела «Closed»/«Закрытые» и помеченные в Open.
 */

/** Состояние пункта: вне разделов Open/Closed — `other` («вне рамок», «замечено»). */
export type BugItemState = 'open' | 'closed' | 'other';

/** Пункт 09-bugs. */
export type BugItem = {
  /** Номер строки пункта в тексте, с нуля. */
  readonly line: number;
  /** Текст пункта одной строкой без разметки. */
  readonly text: string;
  readonly state: BugItemState;
  /** Пункт — чекбокс: меняется на месте, а не переносом. */
  readonly checkbox: boolean;
};

/** Предел длины текста пункта. */
const LINE_MAX = 240;
const OPEN_HEADING = /^(open|открыт|todo|в работе)/i;
const CLOSED_HEADING = /^(closed|закрыт|исправлен|done|fixed|решено|готово)/i;
const HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^(?:[-*+]|\d+[.)])\s+(.*)$/;
const CHECKBOX = /^\[([ xX])\]\s*/;
const CLOSED_MARK = /^(\[закрыт[^\]]*\]|~~)/i;
/** Пункт-заглушка: «(пусто)», «нет», «—». */
const EMPTY_ITEM = /^\(?(пусто|нет|none|—|-)\)?\.?$/i;
/** Строка-заглушка раздела: «(нет)», «- (пусто)», «Открытых нет.». */
const PLACEHOLDER_LINE = /^(?:[-*+]\s+)?(?:\(?(?:пусто|нет|none|—)\)?|открытых( пунктов)? нет)\.?$/i;

/** Строка без markdown-выделения, обрезанная до предела. */
function plain(s: string): string {
  const t = s.replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
  return t.length > LINE_MAX ? `${t.slice(0, LINE_MAX - 1)}…` : t;
}

/** Вид раздела по заголовку. */
function sectionKind(title: string): BugItemState {
  return OPEN_HEADING.test(title) ? 'open' : CLOSED_HEADING.test(title) ? 'closed' : 'other';
}

/** Строки текста с признаком «внутри блока кода» (сами ограды — тоже). */
function scanLines(text: string): { readonly raw: string; readonly fenced: boolean }[] {
  let fenced = false;
  return text.split(/\r?\n/).map((raw) => {
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      return { raw, fenced: true };
    }
    return { raw, fenced };
  });
}

/** Пункт строки или null. */
function itemOf(raw: string, line: number, section: BugItemState): BugItem | null {
  const body = LIST_ITEM.exec(raw.trim())?.[1]?.trim();
  if (body === undefined) {
    return null;
  }
  const box = CHECKBOX.exec(body);
  if (box !== null) {
    const text = plain(body.replace(CHECKBOX, ''));
    return text === '' ? null : { line, text, state: box[1] === ' ' ? 'open' : 'closed', checkbox: true };
  }
  if (/^(\s{2,}|\t)/.test(raw) || EMPTY_ITEM.test(body)) {
    return null;
  }
  const state: BugItemState = section === 'open' && CLOSED_MARK.test(body) ? 'closed' : section;
  return { line, text: plain(body), state, checkbox: false };
}

/**
 * Пункты 09-bugs по порядку.
 *
 * @param text - markdown 09-bugs
 * @returns пункты с номером строки и состоянием
 */
export function bugItems(text: string): BugItem[] {
  let section: BugItemState = 'other';
  const out: BugItem[] = [];
  scanLines(text).forEach(({ raw, fenced }, line) => {
    if (fenced) {
      return;
    }
    const heading = HEADING.exec(raw.trim());
    if (heading?.[2] !== undefined) {
      section = sectionKind(heading[2].trim());
      return;
    }
    const item = itemOf(raw, line, section);
    if (item !== null) {
      out.push(item);
    }
  });
  return out;
}

/** Итог правки. */
export type SetBugResult = { readonly ok: true; readonly changed: boolean; readonly text: string } | { readonly ok: false; readonly error: string };

/** Конец блока пункта: он сам и строки продолжения с отступом. */
function blockEnd(lines: readonly string[], start: number): number {
  let end = start + 1;
  while (end < lines.length && /^(\s{2,}|\t)\S/.test(lines[end] ?? '')) {
    end += 1;
  }
  return end;
}

/** Границы раздела: [заголовок, конец) или null. */
function sectionRange(lines: readonly string[], kind: BugItemState): { readonly start: number; readonly end: number } | null {
  const start = lines.findIndex((l) => {
    const h = HEADING.exec(l.trim());
    return h?.[2] !== undefined && sectionKind(h[2].trim()) === kind;
  });
  if (start < 0) {
    return null;
  }
  const level = HEADING.exec(lines[start]?.trim() ?? '')?.[1]?.length ?? 2;
  let end = start + 1;
  while (end < lines.length) {
    const h = HEADING.exec(lines[end]?.trim() ?? '');
    if (h?.[1] !== undefined && h[1].length <= level) {
      break;
    }
    end += 1;
  }
  return { start, end };
}

/** Без пустых строк в конце. */
function trimEnd(lines: readonly string[]): string[] {
  const out = [...lines];
  while (out.length > 0 && (out[out.length - 1] ?? '').trim() === '') {
    out.pop();
  }
  return out;
}

/** Новый раздел с блоком: Open — после заголовка файла, Closed — в конце. */
function withNewSection(lines: readonly string[], kind: 'open' | 'closed', block: readonly string[]): string[] {
  const title = kind === 'open' ? '## Open' : '## Closed';
  if (kind === 'closed') {
    return [...trimEnd(lines), '', title, '', ...block, ''];
  }
  const at = lines.findIndex((l) => /^#\s/.test(l)) + 1;
  const rest = lines.slice(at);
  return [...trimEnd(lines.slice(0, at)), '', title, '', ...block, ...(rest[0]?.trim() === '' ? rest : ['', ...rest])];
}

/** Вставляет блок в конец раздела (заглушки раздела убираются); раздела нет — создаёт. */
function insertIntoSection(lines: readonly string[], kind: 'open' | 'closed', block: readonly string[]): string[] {
  const range = sectionRange(lines, kind);
  if (range === null) {
    return withNewSection(lines, kind, block);
  }
  const body = lines.slice(range.start + 1, range.end).filter((l) => !PLACEHOLDER_LINE.test(l.trim()));
  const filled = trimEnd(body);
  const gap = body.slice(filled.length);
  const lead = filled.length === 0 ? [''] : [];
  return [...lines.slice(0, range.start + 1), ...filled, ...lead, ...block, ...(gap.length === 0 && range.end < lines.length ? [''] : gap), ...lines.slice(range.end)];
}

/** Строка пункта без пометки «закрыт»: `~~текст~~`, `[закрыт] текст`. */
function unmark(raw: string): string {
  return raw.replace(/~~(.*?)~~/, '$1').replace(/\[закрыт[^\]]*\]\s*/i, '');
}

/**
 * Переводит пункт в состояние: чекбокс — отметкой на месте, пометку «закрыт» в Open —
 * снятием на месте, иначе — переносом в раздел Open/Closed (раздел создаётся, если
 * его нет). Повтор — без изменений.
 *
 * @param text - markdown 09-bugs
 * @param line - номер строки пункта (из bugItems)
 * @param expected - текст пункта, который видел пользователь
 * @param target - нужное состояние
 * @returns новый текст или ошибка (файл изменился, строка не пункт)
 */
export function setBugItemState(text: string, line: number, expected: string, target: 'open' | 'closed'): SetBugResult {
  const item = bugItems(text).find((b) => b.line === line);
  if (item === undefined || item.text !== expected) {
    return { ok: false, error: `в строке ${line + 1} нет пункта «${expected}»: файл изменился — обновите документацию` };
  }
  if (item.state === target) {
    return { ok: true, changed: false, text };
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const open = sectionRange(lines, 'open');
  const inOpen = open !== null && line > open.start && line < open.end;
  if (item.checkbox || (target === 'open' && inOpen)) {
    lines[line] = item.checkbox ? (lines[line] ?? '').replace(/\[[ xX]\]/, target === 'closed' ? '[x]' : '[ ]') : unmark(lines[line] ?? '');
    return { ok: true, changed: true, text: lines.join(eol) };
  }
  const end = blockEnd(lines, line);
  const block = lines.slice(line, end).map((l, i) => (i === 0 && target === 'open' ? unmark(l) : l));
  // Пустая строка до и после пункта — после переноса остаётся одна.
  const gap = (lines[line - 1] ?? '').trim() === '' && (lines[end] ?? 'x').trim() === '' ? 1 : 0;
  const without = [...lines.slice(0, line), ...lines.slice(end + gap)];
  return { ok: true, changed: true, text: insertIntoSection(without, target, block).join(eol) };
}
