/**
 * Реальный UI-путь загрузки Korbor-пресета (MapToolbar + App shell).
 * Порядок: setBaseUrlOverride → loadUnknownJson — store обязан
 * сохранить absolute multi-host URL (korbor-all).
 */
import {
  fetchKorborPreset,
  type FetchPresetResult,
  type KorborPreset,
} from '../korbor-presets';

/** Действия store, которые дергает UI при выборе пресета. */
export type KorborPresetStoreActions = {
  readonly setBaseUrlOverride: (url: string) => void;
  readonly loadUnknownJson: (raw: unknown) => void;
  readonly setMode: (mode: 'live') => void;
};

/**
 * Применяет уже загруженный JSON пресета так же, как MapToolbar/App.
 *
 * @param preset - пресет (baseUrl уйдёт в override)
 * @param json - тело liveappmap / appmap
 * @param actions - сеттеры store
 */
export function applyLoadedKorborPreset(
  preset: KorborPreset,
  json: unknown,
  actions: KorborPresetStoreActions,
): void {
  actions.setBaseUrlOverride(preset.baseUrl);
  actions.loadUnknownJson(json);
  actions.setMode('live');
}

/**
 * fetch + applyLoadedKorborPreset — полный путь кнопки пресета.
 *
 * @param preset - Korbor preset
 * @param actions - store actions
 * @param fetchPreset - injectable fetch (тесты)
 */
export async function loadKorborPresetIntoStore(
  preset: KorborPreset,
  actions: KorborPresetStoreActions,
  fetchPreset: typeof fetchKorborPreset = fetchKorborPreset,
): Promise<FetchPresetResult> {
  const res = await fetchPreset(preset);
  if (!res.ok) {
    return res;
  }
  applyLoadedKorborPreset(preset, res.json, actions);
  return res;
}
