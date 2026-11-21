/**
 * Версии карты для сравнения (Node, dev-сервер): история файла карты в git,
 * содержимое версии по коммиту и свежий скан во временный каталог.
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Коммит, менявший файл карты. */
export type MapVersion = {
  /** Полный хеш коммита. */
  readonly ref: string;
  /** Дата коммита ISO. */
  readonly date: string;
  /** Первая строка сообщения коммита. */
  readonly subject: string;
};

/** Итог команды: текст или ошибка с выводом. */
type ExecResult = { readonly ok: true; readonly stdout: string } | { readonly ok: false; readonly error: string };

/** Предел вывода команды: карты весят до нескольких МБ. */
const MAX_BUFFER = 128 * 1024 * 1024;

/** Запуск команды без shell. */
function run(command: string, args: readonly string[], opts: { cwd: string; env?: Record<string, string>; timeoutMs?: number }): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      [...args],
      { cwd: opts.cwd, env: { ...process.env, ...opts.env }, maxBuffer: MAX_BUFFER, timeout: opts.timeoutMs ?? 30_000 },
      (err, stdout, stderr) => {
        if (err === null) {
          resolve({ ok: true, stdout });
          return;
        }
        const tail = `${stderr}\n${stdout}`.trim().split('\n').slice(-6).join('\n');
        resolve({ ok: false, error: `${err.message.split('\n')[0] ?? ''}${tail === '' ? '' : `\n${tail}`}` });
      },
    );
  });
}

/** Разделитель полей в выводе git log. */
const SEP = '\u001f';

/**
 * Коммиты, менявшие файл карты, новые первыми.
 *
 * @param file - абсолютный путь файла карты
 * @param limit - сколько коммитов
 * @returns версии или ошибка git
 */
export async function listMapVersions(file: string, limit = 30): Promise<{ ok: true; versions: MapVersion[] } | { ok: false; error: string }> {
  const r = await run('git', ['log', `-n${limit}`, `--format=%H${SEP}%cI${SEP}%s`, '--', path.basename(file)], { cwd: path.dirname(file) });
  if (!r.ok) {
    return r;
  }
  const versions = r.stdout
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => {
      const [ref = '', date = '', subject = ''] = l.split(SEP);
      return { ref, date, subject };
    });
  return { ok: true, versions };
}

/** Хеш коммита (короткий или полный). */
const REF = /^[0-9a-f]{7,40}$/;

/**
 * Содержимое файла карты в коммите.
 *
 * @param file - абсолютный путь файла карты
 * @param ref - хеш коммита
 * @returns JSON-текст или ошибка
 */
export async function readMapVersion(file: string, ref: string): Promise<ExecResult> {
  if (!REF.test(ref)) {
    return { ok: false, error: `ref — хеш коммита (7–40 шестнадцатеричных знаков), получено: ${ref}` };
  }
  return run('git', ['show', `${ref}:./${path.basename(file)}`], { cwd: path.dirname(file) });
}

/** Как получить свежий скан карты: команда и файл, который она пишет. */
export type ScanRecipe = {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Record<string, string>;
  /** Файл liveappmap, который пишет команда. */
  readonly output: string;
};

/** Рецепт скана по id карты и временному каталогу; null — скан для карты не настроен. */
export type ScanRecipes = (mapId: string, tmp: string) => ScanRecipe | null;

/**
 * Свежий скан во временный каталог: карта в репозитории не меняется.
 *
 * @param mapId - id карты каталога
 * @param recipes - рецепты сканов
 * @returns JSON-текст свежей карты или ошибка
 */
export async function freshScan(mapId: string, recipes: ScanRecipes): Promise<ExecResult> {
  const tmp = mkdtempSync(path.join(tmpdir(), 'lam-fresh-'));
  try {
    const recipe = recipes(mapId, tmp);
    if (recipe === null) {
      return { ok: false, error: `для карты ${mapId} свежий скан не настроен — сравните версии из истории или файл` };
    }
    const r = await run(recipe.command, recipe.args, { cwd: recipe.cwd, env: recipe.env, timeoutMs: 180_000 });
    return r.ok ? { ok: true, stdout: readFileSync(recipe.output, 'utf8') } : r;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
