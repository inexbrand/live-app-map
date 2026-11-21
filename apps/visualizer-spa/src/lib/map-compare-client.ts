/**
 * Версии карты для вида «Сравнение» в браузере: список коммитов, загрузка версии
 * (открытая карта, файл на диске, коммит, свежий скан, файл с компьютера) в документ.
 */
import type { AppMapDocument } from '@live-app-map/schema';
import { requestJson } from './dev-api';
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

/** Коммит из ответа или null. */
function versionOf(v: unknown): MapVersionInfo | null {
  return typeof v === 'object' && v !== null && 'ref' in v && typeof v.ref === 'string' && 'date' in v && typeof v.date === 'string' && 'subject' in v && typeof v.subject === 'string'
    ? { ref: v.ref, date: v.date, subject: v.subject }
    : null;
}

/**
 * Коммиты файла карты (новые первыми).
 *
 * @param mapId - id карты каталога
 * @returns версии или ошибка
 */
export async function fetchMapVersions(mapId: string): Promise<{ ok: true; versions: MapVersionInfo[] } | { ok: false; error: string }> {
  const r = await requestJson(`/__lam_maps/versions?id=${encodeURIComponent(mapId)}`);
  if (!r.ok) {
    return { ok: false, error: r.error };
  }
  const body = r.value;
  const list: unknown[] = typeof body === 'object' && body !== null && 'versions' in body && Array.isArray(body.versions) ? body.versions : [];
  return { ok: true, versions: list.flatMap((v) => versionOf(v) ?? []) };
}

/** JSON по адресу в документ. */
async function fetchDocument(url: string, method?: 'POST'): Promise<LoadedVersion> {
  const r = await requestJson(url, { cache: 'no-store', ...(method === undefined ? {} : { method }) });
  return r.ok ? documentFromJson(r.value) : { ok: false, error: r.error };
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
        ? fetchDocument(`/__lam_maps/scan?id=${encodeURIComponent(ctx.mapId)}`, 'POST')
        : { ok: false, error: 'карта открыта из файла — сканировать нечего' };
  }
}
