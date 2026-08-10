/**
 * Пресеты Korbor dogfood: пути public maps и baseUrl dev-серверов.
 *
 * Deep-link visualizer: `?map=<path>&baseUrl=<baseUrl>[&role=…]`
 * (см. `buildKorborDeepLinkQuery`).
 */

/** Ожидаемые id dogfood-поверхностей (имя файла = korbor-{id}.liveappmap.json). */
export const KORBOR_DOGFOOD_IDS = ['miniapp', 'admin', 'site'] as const;

export type KorborDogfoodId = (typeof KORBOR_DOGFOOD_IDS)[number];

export const KORBOR_PRESETS = [
  {
    id: 'miniapp',
    label: 'Korbor Miniapp',
    path: '/maps/korbor-miniapp.liveappmap.json',
    /** Vite TLS host miniapp (см. scan-korbor / runtime-smoke). */
    baseUrl: 'https://vite.localhost:5175',
  },
  {
    id: 'admin',
    label: 'Korbor Admin',
    path: '/maps/korbor-admin.liveappmap.json',
    baseUrl: 'http://localhost:16002',
  },
  {
    id: 'site',
    label: 'Korbor Site',
    path: '/maps/korbor-site.liveappmap.json',
    baseUrl: 'http://localhost:16001',
  },
] as const;

export type KorborPreset = (typeof KORBOR_PRESETS)[number];

export type FetchPresetResult =
  | { readonly ok: true; readonly json: unknown }
  | { readonly ok: false; readonly error: string };

/**
 * Канонический path public map для dogfood id.
 *
 * @param id - miniapp | admin | site
 * @returns path вида `/maps/korbor-{id}.liveappmap.json`
 */
export function korborMapPublicPath(id: KorborDogfoodId): string {
  return `/maps/korbor-${id}.liveappmap.json`;
}

/**
 * Query-string deep-link visualizer для пресета (map + baseUrl [+ role]).
 * Совпадает с чтением `?map=&baseUrl=&role=` в App shell.
 *
 * @param preset - пресет Korbor
 * @param options - опциональная роль state-inject
 * @returns query с ведущим `?`
 */
export function buildKorborDeepLinkQuery(
  preset: KorborPreset,
  options?: { readonly role?: string },
): string {
  const params = new URLSearchParams();
  params.set('map', preset.path);
  params.set('baseUrl', preset.baseUrl);
  const role = options?.role;
  if (role !== undefined && role.trim() !== '') {
    params.set('role', role.trim());
  }
  return `?${params.toString()}`;
}

/**
 * Загружает JSON пресета с HTTP-проверкой (не silent fail на 404).
 *
 * @param preset - пресет с path под public/maps
 * @returns ok+json или ok:false с текстом ошибки
 */
export async function fetchKorborPreset(
  preset: KorborPreset,
): Promise<FetchPresetResult> {
  try {
    const res = await fetch(preset.path);
    if (!res.ok) {
      return {
        ok: false,
        error: `Не удалось загрузить ${preset.path}: HTTP ${res.status}`,
      };
    }
    const json = (await res.json()) as unknown;
    return { ok: true, json };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Сеть: ${preset.path} — ${message}`,
    };
  }
}
