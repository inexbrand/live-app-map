/**
 * Единый импорт карты: JSON (enterprise / liveappmap) и .appmap / .zip.
 * App и MapToolbar только вызывают эти функции — без дублирования parse.
 */
import {
  parseAppMapDocument,
  parseLiveAppMapDocument,
} from '@live-app-map/schema';

/** Успешный импорт: готовый JSON для `loadUnknownJson`. */
export type ImportMapSuccess = {
  readonly ok: true;
  readonly json: unknown;
  /** Краткий toast (например после .appmap). */
  readonly toast?: string;
};

/** Ошибка импорта: строка для banner / toast. */
export type ImportMapFailure = {
  readonly ok: false;
  readonly error: string;
};

export type ImportMapResult = ImportMapSuccess | ImportMapFailure;

/**
 * Проверяет уже разобранный объект: enterprise AppMap или liveappmap.
 * @param raw — результат JSON.parse / document из zip
 */
export function importMapValue(raw: unknown): ImportMapResult {
  const asApp = parseAppMapDocument(raw);
  if (asApp.ok) {
    return { ok: true, json: raw };
  }
  const asLive = parseLiveAppMapDocument(raw);
  if (asLive.ok) {
    return { ok: true, json: raw };
  }
  const detail =
    asLive.errors[0]?.message ??
    asApp.errors[0]?.message ??
    'неизвестная ошибка';
  return {
    ok: false,
    error: `Не удалось разобрать JSON: ${detail}`,
  };
}

/**
 * Разбирает текст JSON (enterprise AppMap или liveappmap).
 * @param text — содержимое .json файла
 */
export function importMapJson(text: string): ImportMapResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: 'Не удалось прочитать JSON' };
  }
  return importMapValue(raw);
}

/**
 * Импортирует файл `.json` / `.appmap` / `.zip`.
 * @param file — выбранный или drop-файл
 */
export async function importMapFile(file: File): Promise<ImportMapResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.appmap') || name.endsWith('.zip')) {
    const { parseAppMapZip } = await import('@live-app-map/export-appmap');
    const result = await parseAppMapZip(await file.arrayBuffer());
    if (!result.ok) {
      return { ok: false, error: result.errors.join('; ') };
    }
    return {
      ok: true,
      json: result.document,
      toast: `Импорт .appmap: ${result.document.pages.length} pages`,
    };
  }
  return importMapJson(await file.text());
}
