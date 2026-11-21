/**
 * Документация с диска в браузере: свежий раздел docs и отметка пункта 09-bugs
 * через dev-сервер (docs-write-middleware).
 */
import type { DocEpoch, DocsModel } from '@live-app-map/schema';

/** Итог запроса: значение или текст ошибки. */
export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

/** Текст ошибки из JSON-ответа. */
async function errorOf(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  const msg = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string' ? body.error : '';
  return msg === '' ? `HTTP ${res.status}` : msg;
}

/** Поле JSON-ответа, прошедшее проверку вида. */
function field<T>(body: unknown, key: string, check: (v: unknown) => v is T): T | null {
  const v = typeof body === 'object' && body !== null ? Object.entries(body).find(([k]) => k === key)?.[1] : undefined;
  return check(v) ? v : null;
}

function isDocsModel(v: unknown): v is DocsModel {
  return typeof v === 'object' && v !== null && 'root' in v && 'epochs' in v && Array.isArray(v.epochs) && 'notes' in v && 'guides' in v;
}

function isEpoch(v: unknown): v is DocEpoch {
  return typeof v === 'object' && v !== null && 'id' in v && 'dir' in v && 'files' in v && Array.isArray(v.files) && 'readiness' in v;
}

/**
 * Раздел docs, снятый с диска сейчас.
 *
 * @param root - docs.root карты
 * @returns docs или ошибка (каталога нет на этой машине, dev-сервера нет)
 */
export async function fetchLiveDocs(root: string): Promise<Result<DocsModel>> {
  try {
    const res = await fetch(`/__lam_docs/live?root=${encodeURIComponent(root)}`, { cache: 'no-store' });
    const docs = res.ok ? field(await res.json(), 'docs', isDocsModel) : null;
    return docs === null ? { ok: false, error: res.ok ? 'ответ без docs' : await errorOf(res) } : { ok: true, value: docs };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Отметка пункта. */
export type BugMark = { readonly root: string; readonly path: string; readonly line: number; readonly text: string; readonly state: 'open' | 'closed' };

/**
 * Закрывает или открывает пункт 09-bugs правкой файла на диске.
 *
 * @param mark - файл, строка, текст пункта, нужное состояние
 * @returns эпоха заново (готовность пересчитана) или ошибка
 */
export async function markBug(mark: BugMark): Promise<Result<DocEpoch>> {
  try {
    const res = await fetch('/__lam_docs/bug', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(mark) });
    const epoch = res.ok ? field(await res.json(), 'epoch', isEpoch) : null;
    return epoch === null ? { ok: false, error: res.ok ? 'ответ без эпохи' : await errorOf(res) } : { ok: true, value: epoch };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Раздел docs с заменённой эпохой.
 *
 * @param docs - раздел docs
 * @param epoch - эпоха после правки
 * @returns новый раздел
 */
export function withEpoch(docs: DocsModel, epoch: DocEpoch): DocsModel {
  return { ...docs, epochs: docs.epochs.map((e) => (e.id === epoch.id ? epoch : e)) };
}
