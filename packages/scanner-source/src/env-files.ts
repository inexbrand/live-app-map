/**
 * База URL из env-файлов сервиса: `VITE_API_URL=https://host/api` → `/api`.
 * Из значения берётся только путь — origin и секреты в карту не попадают.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Файлы, которые читают Vite и Next, от общих к локальным: побеждает первый с переменной. */
const ENV_FILES = ['.env.example', '.env.development', '.env', '.env.local', '.env.production'];

/**
 * Разбирает env-файл: `KEY=value`, кавычки снимаются, комментарии пропускаются.
 *
 * @param text - содержимое файла
 * @returns переменные
 */
function parseEnv(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m?.[1] !== undefined && m[2] !== undefined) {
      out.set(m[1], m[2].replace(/^(['"])(.*)\1$/, '$2'));
    }
  }
  return out;
}

/**
 * Путь из значения базового URL: origin отбрасывается, хвостовой `/` снимается.
 *
 * @param value - значение переменной
 * @returns путь (`''` для голого origin) или undefined, если это не URL
 */
export function basePathOf(value: string): string | undefined {
  const v = value.trim();
  const withOrigin = /^(?:[a-z][\w+.-]*:)?\/\/[^/]*(.*)$/i.exec(v) ?? /^[\w.-]+:\d+(.*)$/.exec(v);
  const rest = withOrigin === null ? v : (withOrigin[1] ?? '');
  if (rest !== '' && !rest.startsWith('/')) {
    return undefined;
  }
  return rest.replace(/[?#].*$/, '').replace(/\/+$/, '');
}

/** Читает переменные env сервисов с кэшем по каталогу. */
export class EnvFiles {
  private readonly cache = new Map<string, Map<string, string>>();

  /**
   * Путь базы для переменной сервиса.
   *
   * @param serviceDir - абсолютный каталог сервиса
   * @param name - имя переменной
   * @returns путь базы или undefined, если переменной нет или это не URL
   */
  basePath(serviceDir: string, name: string): string | undefined {
    const value = this.varsOf(serviceDir).get(name);
    return value === undefined ? undefined : basePathOf(value);
  }

  private varsOf(dir: string): Map<string, string> {
    const cached = this.cache.get(dir);
    if (cached !== undefined) {
      return cached;
    }
    const vars = new Map<string, string>();
    for (const f of ENV_FILES) {
      const p = path.join(dir, f);
      if (existsSync(p)) {
        for (const [k, v] of parseEnv(readFileSync(p, 'utf8'))) {
          if (!vars.has(k)) {
            vars.set(k, v);
          }
        }
      }
    }
    this.cache.set(dir, vars);
    return vars;
  }
}
