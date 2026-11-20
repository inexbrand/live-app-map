/**
 * Пресеты Korbor dogfood: пути public maps и baseUrl dev-серверов.
 *
 * Deep-link visualizer: `?map=<path>&baseUrl=<baseUrl>[&role=…]`
 * (см. `buildKorborDeepLinkQuery`).
 */

/** id dogfood-поверхности (имя файла = korbor-{id}.liveappmap.json). */
export type KorborDogfoodId = 'miniapp' | 'admin' | 'site';

/** id пресета: поверхность или объединённая карта всех поверхностей. */
export type KorborPresetId = KorborDogfoodId | 'all';

/** Пресет Korbor: карта в public/maps и dev-сервер поверхности. */
export type KorborPreset = {
  readonly id: KorborPresetId;
  readonly label: string;
  readonly path: string;
  readonly baseUrl: string;
};

/** Ожидаемые dogfood-поверхности. */
export const KORBOR_DOGFOOD_IDS: readonly KorborDogfoodId[] = ['miniapp', 'admin', 'site'];

/** Пресеты Korbor в порядке показа. */
export const KORBOR_PRESETS: readonly KorborPreset[] = [
  {
    id: 'all',
    label: 'Весь Korbor',
    path: '/maps/korbor-all.liveappmap.json',
    /** У страниц уже absolute url; baseUrl — fallback */
    baseUrl: 'http://localhost:16001',
  },
  {
    id: 'miniapp',
    label: 'Мини-приложение',
    path: '/maps/korbor-miniapp.liveappmap.json',
    /** Vite TLS host miniapp (см. scan-korbor / runtime-smoke). */
    baseUrl: 'https://vite.localhost:5175',
  },
  {
    id: 'admin',
    label: 'Админка',
    path: '/maps/korbor-admin.liveappmap.json',
    baseUrl: 'http://localhost:16002',
  },
  {
    id: 'site',
    label: 'Сайт',
    path: '/maps/korbor-site.liveappmap.json',
    baseUrl: 'http://localhost:16001',
  },
];

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
