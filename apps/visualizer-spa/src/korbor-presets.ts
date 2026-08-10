/**
 * Пресеты Korbor dogfood: пути public maps и baseUrl dev-серверов.
 */

export const KORBOR_PRESETS = [
  {
    id: 'miniapp',
    label: 'Korbor Miniapp',
    path: '/maps/korbor-miniapp.liveappmap.json',
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
 * Загружает JSON пресета с HTTP-проверкой (не silent fail на 404).
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
