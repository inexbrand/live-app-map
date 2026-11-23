/**
 * Загрузка JSON-файла визуализатора (карта, каталог) с понятной ошибкой по-русски:
 * что случилось и что сделать, без сырых «Unexpected token '<'» и «HTTP 404».
 */
import { errorText } from './dev-api';

/** Почему файл не загрузился. */
type LoadFailure =
  | { readonly kind: 'http'; readonly status: number }
  | { readonly kind: 'html' }
  | { readonly kind: 'not-json'; readonly detail: string }
  | { readonly kind: 'network'; readonly detail: string };

/** Итог загрузки. */
export type JsonFileResult = { readonly ok: true; readonly json: unknown } | { readonly ok: false; readonly error: string };

/** Подсказка, когда файла по адресу нет. */
const PICK_HINT = 'Выберите карту в списке сверху или проверьте путь.';

/**
 * Текст ошибки для человека.
 *
 * @param what - что грузили: «Карта», «Каталог карт»
 * @param path - адрес файла
 * @param f - причина
 */
function loadErrorText(what: string, path: string, f: LoadFailure): string {
  switch (f.kind) {
    case 'http':
      return f.status === 404
        ? `${what}: файл ${path} не найден (HTTP 404). ${PICK_HINT}`
        : `${what}: сервер не отдал ${path} (HTTP ${f.status}). Обновите страницу; если повторяется — перезапустите визуализатор.`;
    case 'html':
      return `${what}: по адресу ${path} нет файла — сервер вернул веб-страницу. ${PICK_HINT}`;
    case 'not-json':
      return `${what}: файл ${path} повреждён — это не JSON (${f.detail}).`;
    case 'network':
      return `${what}: нет связи с визуализатором, ${path} не загрузился (${f.detail}). Проверьте, что dev-сервер запущен.`;
  }
}

/** Тело ответа: JSON или причина, почему нет. */
function parseBody(text: string): { readonly ok: true; readonly json: unknown } | LoadFailure {
  if (text.trimStart().startsWith('<')) {
    return { kind: 'html' };
  }
  try {
    const json: unknown = JSON.parse(text);
    return { ok: true, json };
  } catch (err) {
    return { kind: 'not-json', detail: errorText(err) };
  }
}

/**
 * Загружает JSON-файл; ошибка — готовый текст для баннера.
 *
 * @param what - что грузим: «Карта», «Каталог карт»
 * @param path - адрес
 * @param fetchFn - fetch (подменяется в тестах)
 * @param init - параметры запроса
 */
export async function fetchJsonFile(what: string, path: string, fetchFn: typeof fetch = fetch, init?: RequestInit): Promise<JsonFileResult> {
  let text: string;
  try {
    const res = await fetchFn(path, init);
    if (!res.ok) {
      return { ok: false, error: loadErrorText(what, path, { kind: 'http', status: res.status }) };
    }
    text = await res.text();
  } catch (err) {
    return { ok: false, error: loadErrorText(what, path, { kind: 'network', detail: errorText(err) }) };
  }
  const body = parseBody(text);
  return 'kind' in body ? { ok: false, error: loadErrorText(what, path, body) } : body;
}