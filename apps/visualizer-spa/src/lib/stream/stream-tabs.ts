/**
 * Список вкладок владельца трансляции на диске: id вкладки браузера (CDP
 * targetId) → ключ экрана и адрес, на который её перевела карта. По нему новый
 * сервис после перезапуска vite узнаёт свои вкладки в постоянном браузере:
 * пометка в самой странице теряется, если приложение перезагрузилось, пока vite
 * не было, а targetId живёт, пока живёт вкладка.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BrowserContext, CDPSession, Page } from '@playwright/test';

/** Вкладка экрана: ключ и адрес последнего перехода карты. */
export type TabRecord = { readonly key: string; readonly url: string };

/**
 * Прочитать список; нет файла или он битый — пустой.
 *
 * @param file - путь к списку
 */
export async function readTabs(file: string): Promise<Map<string, TabRecord>> {
  const out = new Map<string, TabRecord>();
  let data: unknown;
  try {
    data = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return out;
  }
  if (typeof data !== 'object' || data === null) {
    return out;
  }
  for (const [id, v] of Object.entries(data)) {
    const key: unknown = typeof v === 'object' && v !== null ? Reflect.get(v, 'key') : undefined;
    const url: unknown = typeof v === 'object' && v !== null ? Reflect.get(v, 'url') : undefined;
    if (typeof key === 'string' && typeof url === 'string') {
      out.set(id, { key, url });
    }
  }
  return out;
}

/**
 * Записать список целиком.
 *
 * @param file - путь к списку
 * @param tabs - targetId → вкладка
 */
export async function writeTabs(file: string, tabs: ReadonlyMap<string, TabRecord>): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(Object.fromEntries(tabs)));
}

/**
 * Id вкладки браузера по её CDP-сессии; null — вкладка уже закрыта.
 *
 * @param cdp - сессия страницы
 */
export async function targetIdOf(cdp: CDPSession): Promise<string | null> {
  const r = await cdp.send('Target.getTargetInfo').catch(() => null);
  return r?.targetInfo.targetId ?? null;
}

/** Своя вкладка прошлого сервиса: ждёт, подхватят ли её. */
export type OwnTab = { readonly page: Page; readonly url: string };

/**
 * Свои вкладки прошлого сервиса в браузере — по списку на диске и targetId.
 * Две вкладки на один ключ — лишняя закрывается.
 *
 * @param ctx - контекст браузера
 * @param file - список вкладок владельца
 * @returns ключ экрана → вкладка
 */
export async function findOwnTabs(ctx: BrowserContext, file: string): Promise<Map<string, OwnTab>> {
  const out = new Map<string, OwnTab>();
  const tabs = await readTabs(file);
  if (tabs.size === 0) {
    return out;
  }
  for (const page of ctx.pages()) {
    const cdp = await ctx.newCDPSession(page).catch(() => null);
    const id = cdp === null ? null : await targetIdOf(cdp);
    await cdp?.detach().catch(() => undefined);
    const tab = id === null ? undefined : tabs.get(id);
    if (tab === undefined) {
      continue;
    }
    if (out.has(tab.key)) {
      await page.close().catch(() => undefined);
    } else {
      out.set(tab.key, { page, url: tab.url });
    }
  }
  return out;
}
