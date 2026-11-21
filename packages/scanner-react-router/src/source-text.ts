/**
 * Разбор исходника без парсера: парные скобки, свойства объекта-литерала
 * верхнего уровня, пути переходов to="/x".
 */

/** Текст вызова от открывающей скобки до парной закрывающей (строки и шаблоны учтены). */
export function balancedFrom(source: string, open: number): string {
  const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']' };
  const stack: string[] = [];
  for (let i = open; i < source.length; i++) {
    const c = source[i] ?? '';
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      i++;
      while (i < source.length && source[i] !== q) {
        i += source[i] === '\\' ? 2 : 1;
      }
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i);
      if (i < 0) break;
      continue;
    }
    if (pairs[c] !== undefined) {
      stack.push(pairs[c] ?? '');
    } else if (c === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) {
        return source.slice(open, i + 1);
      }
    }
  }
  return source.slice(open);
}

/** Свойства верхнего уровня объекта-литерала: ключ → текст значения. */
export function topLevelProps(objectText: string): Map<string, string> {
  const body = objectText.trim().replace(/^\{/, '').replace(/\}$/, '');
  const props = new Map<string, string>();
  let depth = 0;
  let start = 0;
  const flush = (end: number) => {
    const seg = body.slice(start, end);
    const m = /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*([A-Za-z_$][\w$]*)\s*:\s*([\s\S]*)$/.exec(seg);
    if (m !== null && m[1] !== undefined && m[2] !== undefined) {
      props.set(m[1], m[2].trim());
    }
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i] ?? '';
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      i++;
      while (i < body.length && body[i] !== q) {
        i += body[i] === '\\' ? 2 : 1;
      }
    } else if (c === '/' && body[i + 1] === '/') {
      const nl = body.indexOf('\n', i);
      i = nl < 0 ? body.length : nl;
    } else if ('({['.includes(c)) {
      depth++;
    } else if (')}]'.includes(c)) {
      depth--;
    } else if (c === ',' && depth === 0) {
      flush(i);
      start = i + 1;
    }
  }
  flush(body.length);
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

