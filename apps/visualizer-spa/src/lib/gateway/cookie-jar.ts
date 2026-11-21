/**
 * Банка кук профиля: разбор Set-Cookie, слияние, заголовок Cookie для
 * приложения и Set-Cookie для браузера на origin шлюза.
 */

/** Кука в банке профиля. */
export type StoredCookie = {
  readonly name: string;
  readonly value: string;
  readonly path: string;
  /** Срок в мс epoch; нет — сессионная. */
  readonly expiresAt?: number;
};

/**
 * Разбирает один заголовок Set-Cookie.
 *
 * @param header - значение заголовка
 * @param now - текущее время, мс
 * @returns кука или null
 */
export function parseSetCookie(header: string, now: number): StoredCookie | null {
  const [pair, ...attrs] = header.split(';');
  const eq = pair?.indexOf('=') ?? -1;
  if (pair === undefined || eq <= 0) {
    return null;
  }
  let path = '/';
  let expiresAt: number | undefined;
  for (const raw of attrs) {
    const [k = '', ...rest] = raw.trim().split('=');
    const v = rest.join('=');
    const key = k.toLowerCase();
    if (key === 'path' && v.startsWith('/')) {
      path = v;
    } else if (key === 'max-age' && /^-?\d+$/.test(v)) {
      expiresAt = now + Number(v) * 1000;
    } else if (key === 'expires' && expiresAt === undefined) {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) {
        expiresAt = t;
      }
    }
  }
  return {
    name: pair.slice(0, eq).trim(),
    value: pair.slice(eq + 1).trim(),
    path,
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
}

/**
 * Банка после ответа: новые куки заменяют одноимённые, истёкшие уходят.
 *
 * @param jar - куки профиля для origin
 * @param setCookies - заголовки Set-Cookie ответа
 * @param now - текущее время, мс
 * @returns новая банка
 */
export function mergeSetCookies(jar: readonly StoredCookie[], setCookies: readonly string[], now: number): StoredCookie[] {
  const byKey = new Map(jar.map((c) => [`${c.name}|${c.path}`, c]));
  const fresh = setCookies.flatMap((h) => parseSetCookie(h, now) ?? []);
  // Сервер главнее: его кука вытесняет одноимённые с другим путём (например, вставленную вручную с Path=/).
  const serverNames = new Set(fresh.map((c) => c.name));
  for (const [key, c] of byKey) {
    if (serverNames.has(c.name)) {
      byKey.delete(key);
    }
  }
  for (const c of fresh) {
    byKey.set(`${c.name}|${c.path}`, c);
  }
  return [...byKey.values()].filter((c) => c.expiresAt === undefined || c.expiresAt > now);
}

/**
 * Заголовок Cookie для приложения: куки браузера плюс недостающие из банки.
 *
 * @param browserHeader - Cookie от браузера (может быть пустым)
 * @param jar - банка профиля
 * @param requestPath - путь запроса
 * @param now - текущее время
 * @returns значение заголовка или пустая строка
 */
export function cookieHeaderFor(browserHeader: string, jar: readonly StoredCookie[], requestPath: string, now: number): string {
  const pairs = browserHeader
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.includes('='));
  const names = new Set(pairs.map((p) => p.slice(0, p.indexOf('='))));
  for (const c of jar) {
    if (!names.has(c.name) && requestPath.startsWith(c.path) && (c.expiresAt === undefined || c.expiresAt > now)) {
      pairs.push(`${c.name}=${c.value}`);
      names.add(c.name);
    }
  }
  return pairs.join('; ');
}

/**
 * Set-Cookie для браузера на origin шлюза: без Domain и Secure (шлюз — http
 * на *.localhost), SameSite=Lax — iframe на том же сайте localhost получит куку.
 *
 * @param header - Set-Cookie приложения
 * @returns заголовок для браузера
 */
export function rewriteSetCookieForBrowser(header: string): string {
  const parts = header.split(';').map((s) => s.trim());
  const kept = parts.filter((p, i) => {
    const key = p.split('=')[0]?.toLowerCase() ?? '';
    return i === 0 || (key !== 'domain' && key !== 'secure' && key !== 'samesite' && key !== 'partitioned');
  });
  return [...kept, 'SameSite=Lax'].join('; ');
}
