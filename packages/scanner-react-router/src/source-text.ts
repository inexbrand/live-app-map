/**
 * Разбор исходника без парсера: парные скобки, свойства объекта-литерала
 * верхнего уровня, пути переходов to="/x".
 */

const QUOTES = new Set(['"', "'", '`']);

/** Индекс закрывающей кавычки строки, открытой в from (экранирование учтено); нет — длина текста или больше. */
function closingQuote(text: string, from: number): number {
  const q = text[from];
  let i = from + 1;
  while (i < text.length && text[i] !== q) {
    i += text[i] === '\\' ? 2 : 1;
  }
  return i;
}

/** Символы кода с позициями: строки, шаблоны и комментарии // пропускаются. */
function* codeChars(text: string, from: number): Generator<[number, string]> {
  for (let i = from; i < text.length; i++) {
    const c = text[i] ?? '';
    if (QUOTES.has(c)) {
      i = closingQuote(text, i);
    } else if (c === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      if (nl < 0) {
        return;
      }
      i = nl;
    } else {
      yield [i, c];
    }
  }
}

const PAIRS = new Map([['(', ')'], ['{', '}'], ['[', ']']]);

/** Текст вызова от открывающей скобки до парной закрывающей (строки и шаблоны учтены). */
export function balancedFrom(source: string, open: number): string {
  const stack: string[] = [];
  for (const [i, c] of codeChars(source, open)) {
    const close = PAIRS.get(c);
    if (close !== undefined) {
      stack.push(close);
    } else if (c === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) {
        return source.slice(open, i + 1);
      }
    }
  }
  return source.slice(open);
}

const PROP = /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*([A-Za-z_$][\w$]*)\s*:\s*([\s\S]*)$/;

/** Позиции запятых верхнего уровня. */
function topLevelCommas(body: string): number[] {
  const commas: number[] = [];
  let depth = 0;
  for (const [i, c] of codeChars(body, 0)) {
    if ('({['.includes(c)) {
      depth++;
    } else if (')}]'.includes(c)) {
      depth--;
    } else if (c === ',' && depth === 0) {
      commas.push(i);
    }
  }
  return commas;
}

/** Свойства верхнего уровня объекта-литерала: ключ → текст значения. */
export function topLevelProps(objectText: string): Map<string, string> {
  const body = objectText.trim().replace(/^\{/, '').replace(/\}$/, '');
  const props = new Map<string, string>();
  const ends = [...topLevelCommas(body), body.length];
  ends.forEach((end, k) => {
    const m = PROP.exec(body.slice(k === 0 ? 0 : (ends[k - 1] ?? 0) + 1, end));
    if (m?.[1] !== undefined && m[2] !== undefined) {
      props.set(m[1], m[2].trim());
    }
  });
  return props;
}

const TO_RE = /\bto(?:\s*=\s*\{?\s*|\s*:\s*)["'`](\/[^"'`?#]*)[^"'`]*["'`]/g;

/** Строка позиции в тексте, с 1. */
export function lineAt(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

/** Переходы в тексте: to="/x", to: '/x', to={'/x'} — путь и строка (первое вхождение). */
export function linkTargetsAt(text: string): Array<{ readonly to: string; readonly line: number }> {
  const seen = new Map<string, number>();
  for (const m of text.matchAll(TO_RE)) {
    if (m[1] !== undefined && !seen.has(m[1])) {
      seen.set(m[1], lineAt(text, m.index ?? 0));
    }
  }
  return [...seen].map(([to, line]) => ({ to, line }));
}

/** Пути переходов в тексте: to="/x", to: '/x', to={'/x'}. */
export function linkTargets(text: string): string[] {
  return linkTargetsAt(text).map((l) => l.to);
}