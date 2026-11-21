/**
 * Версии карты для вида «Сравнение» в браузере: список коммитов, загрузка версии
 * (открытая карта, файл на диске, коммит, свежий скан, файл с компьютера) в документ.
 */
import type { AppMapDocument } from '@live-app-map/schema';
import { documentFromJson } from './import-map';

/** Коммит файла карты. */
export type MapVersionInfo = { readonly ref: string; readonly date: string; readonly subject: string };

/** Выбор версии. */
export type VersionChoice =
  | { readonly kind: 'open' }
  | { readonly kind: 'disk' }
  | { readonly kind: 'scan' }
  | { readonly kind: 'git'; readonly ref: string }
  | { readonly kind: 'file'; readonly name: string; readonly json: unknown };

/** Документ или текст ошибки. */
export type LoadedVersion = { readonly ok: true; readonly document: AppMapDocument } | { readonly ok: false; readonly error: string };

/** Текст ошибки из JSON-ответа dev-сервера. */
async function errorOf(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  const msg = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string' ? body.error : '';
  return msg === '' ? `HTTP ${res.status}` : msg;
}

/**
 * Коммиты файла карты (новые первыми).
 *
 * @param mapId - id карты каталога
 * @returns версии или ошибка
 */
export async function fetchMapVersions(mapId: string): Promise<{ ok: true; versions: MapVersionInfo[] } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/__lam_maps/versions?id=${encodeURIComponent(mapId)}`);
    if (!res.ok) {
      return { ok: false, error: await errorOf(res) };
    }
    const body: unknown = await res.json();
    const list = typeof body === 'object' && body !== null && 'versions' in body && Array.isArray(body.versions) ? body.versions : [];
    const versions = list.flatMap((v: unknown): MapVersionInfo[] =>
      typeof v === 'object' && v !== null && 'ref' in v && typeof v.ref === 'string' && 'date' in v && typeof v.date === 'string' && 'subject' in v && typeof v.subject === 'string'
        ? [{ ref: v.ref, date: v.date, subject: v.subject }]
        : [],
    );
    return { ok: true, versions };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** JSON по адресу в документ. */
async function fetchDocument(url: string, init?: RequestInit): Promise<LoadedVersion> {
  try {
    const res = await fetch(url, { cache: 'no-store', ...init });
    return res.ok ? documentFromJson(await res.json()) : { ok: false, error: await errorOf(res) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Документ выбранной версии.
 *
 * @param choice - версия
 * @param ctx - открытая карта и её запись каталога (null — карта из файла)
 * @returns документ или ошибка
 */
export async function loadVersion(
  choice: VersionChoice,
  ctx: { readonly open: AppMapDocument | null; readonly mapId: string | null; readonly mapPath: string | null },
): Promise<LoadedVersion> {
  const need = (v: string | null): v is string => v !== null;
  switch (choice.kind) {
    case 'open':
      return ctx.open === null ? { ok: false, error: 'карта не открыта' } : { ok: true, document: ctx.open };
    case 'file':
      return documentFromJson(choice.json);
    case 'disk':
      return need(ctx.mapPath) ? fetchDocument(ctx.mapPath) : { ok: false, error: 'карта открыта из файла — файла каталога нет' };
    case 'git':
      return need(ctx.mapId)
        ? fetchDocument(`/__lam_maps/version?id=${encodeURIComponent(ctx.mapId)}&ref=${encodeURIComponent(choice.ref)}`)
        : { ok: false, error: 'карта открыта из файла — истории нет' };
    case 'scan':
      return need(ctx.mapId)
        ? fetchDocument(`/__lam_maps/scan?id=${encodeURIComponent(ctx.mapId)}`, { method: 'POST' })
        : { ok: false, error: 'карта открыта из файла — сканировать нечего' };
  }
}
