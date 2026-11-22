/**
 * Документация с диска в браузере: свежий раздел docs и отметка пункта 09-bugs
 * через dev-сервер (docs-write-middleware).
 */
import type { DocEpoch, DocsModel } from '@live-app-map/schema';
import { apiField, requestJson } from './dev-api';

/** Итог запроса: значение или текст ошибки. */
export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

/** Поле ответа нужного вида или ошибка (`missing` — если 2xx без поля). */
async function fieldOf<T>(
  url: string,
  init: Parameters<typeof requestJson>[1],
  key: string,
  check: (v: unknown) => v is T,
  missing: string,
): Promise<Result<T>> {
  const r = await requestJson(url, init);
  if (!r.ok) {
    return { ok: false, error: r.error };
  }
  const value = apiField(r.value, key, check);
  return value === null ? { ok: false, error: missing } : { ok: true, value };
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
  return fieldOf(`/__lam_docs/live?root=${encodeURIComponent(root)}`, { cache: 'no-store' }, 'docs', isDocsModel, 'ответ без docs');
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
  return fieldOf('/__lam_docs/bug', { method: 'POST', json: mark }, 'epoch', isEpoch, 'ответ без эпохи');
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
