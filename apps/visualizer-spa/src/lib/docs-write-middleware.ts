/**
 * Документация проекта с диска для вида «Документация»:
 *
 * - GET  /__lam_docs/live?root=<каталог> — раздел docs, снятый с диска сейчас;
 * - POST /__lam_docs/bug {root, path, line, text, state} — пункт 09-bugs закрыть/открыть:
 *   правка самого markdown-файла эпохи, в ответе — эпоха заново (готовность пересчитана).
 *
 * Пишется только `docs/epoch/<эпоха>/09-bugs.md` внутри root и только с локальной страницы.
 */
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readEpoch, scanDocs, setBugItemState } from '@live-app-map/scanner-docs';
import { isLocalOrigin, parseJsonText, readBody, requestPath, sendError, sendJson, type DevMiddleware } from './dev-http';

export const DOCS_LIVE_PATH = '/__lam_docs/live';
export const DOCS_BUG_PATH = '/__lam_docs/bug';

/** Путь 09-bugs эпохи от корня. */
const BUGS_FILE = /^docs\/epoch\/[^/]+\/09-bugs\.md$/;

/** Запрос отметки пункта. */
type BugRequest = { readonly root: string; readonly path: string; readonly line: number; readonly text: string; readonly state: 'open' | 'closed' };

/** Разбор тела запроса отметки на границе. */
function parseBugRequest(v: unknown): BugRequest | string {
  if (typeof v !== 'object' || v === null) {
    return 'тело — JSON {root, path, line, text, state}';
  }
  const [root, file, line, text, state]: unknown[] = ['root', 'path', 'line', 'text', 'state'].map((k) => Reflect.get(v, k));
  if (!isAbsoluteDir(root)) {
    return 'root — абсолютный каталог проекта (docs.root карты)';
  }
  if (!isBugsFile(file)) {
    return 'path — docs/epoch/<эпоха>/09-bugs.md';
  }
  if (!isLineNumber(line) || !isFilled(text)) {
    return 'line — номер строки пункта с нуля, text — текст пункта';
  }
  if (state !== 'open' && state !== 'closed') {
    return 'state — open или closed';
  }
  return { root, path: file, line, text, state };
}

function isAbsoluteDir(v: unknown): v is string {
  return typeof v === 'string' && path.isAbsolute(v);
}

function isBugsFile(v: unknown): v is string {
  return typeof v === 'string' && BUGS_FILE.test(v);
}

function isLineNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function isFilled(v: unknown): v is string {
  return typeof v === 'string' && v !== '';
}

/** Корень проекта, который есть на этой машине. */
function existingRoot(root: string): boolean {
  return path.isAbsolute(root) && existsSync(root) && statSync(root).isDirectory();
}

/** Отметка пункта: правка файла и эпоха заново. */
function applyBug(req: BugRequest): { status: number; body: unknown } {
  if (!existingRoot(req.root)) {
    return { status: 404, body: { ok: false, error: `каталога проекта нет на этой машине: ${req.root}` } };
  }
  const abs = path.resolve(req.root, req.path);
  if (path.relative(req.root, abs).split(path.sep).join('/') !== req.path || !existsSync(abs)) {
    return { status: 404, body: { ok: false, error: `нет файла ${req.path} в ${req.root}` } };
  }
  const r = setBugItemState(readFileSync(abs, 'utf8'), req.line, req.text, req.state);
  if (!r.ok) {
    return { status: 409, body: { ok: false, error: r.error } };
  }
  if (r.changed) {
    // Запись целиком через временный файл: оборванная запись не портит 09-bugs.
    const tmp = `${abs}.lam-tmp`;
    writeFileSync(tmp, r.text);
    renameSync(tmp, abs);
  }
  return { status: 200, body: { ok: true, changed: r.changed, epoch: readEpoch(req.root, path.dirname(abs)) } };
}

/** Middleware документации с диска. */
/** Документация проекта с диска: root — абсолютный каталог проекта. */
function sendLiveDocs(req: Parameters<DevMiddleware>[0], res: Parameters<DevMiddleware>[1]): void {
  const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root');
  if (root === null || root === '') {
    sendError(res, 400, 'не задан root — абсолютный путь к каталогу проекта');
    return;
  }
  if (!existingRoot(root)) {
    sendError(res, 404, `каталога проекта нет на этой машине: ${root}`);
    return;
  }
  sendJson(res, 200, { ok: true, docs: scanDocs(root) });
}

export const docsWriteMiddleware: DevMiddleware = (req, res, next) => {
  const p = requestPath(req);
  if (p === DOCS_LIVE_PATH) {
    sendLiveDocs(req, res);
    return;
  }
  if (p !== DOCS_BUG_PATH) {
    next();
    return;
  }
  if (req.method !== 'POST' || !isLocalOrigin(req)) {
    sendError(res, req.method !== 'POST' ? 405 : 403, 'отметка — POST с локальной страницы');
    return;
  }
  void readBody(req, 64 * 1024).then((body) => {
    const json = body.ok ? parseJsonText(body.text) : null;
    const parsed = json === null ? 'тело — JSON {root, path, line, text, state}' : parseBugRequest(json.value);
    if (typeof parsed === 'string') {
      sendError(res, 400, parsed);
      return;
    }
    const out = applyBug(parsed);
    sendJson(res, out.status, out.body);
  });
};
