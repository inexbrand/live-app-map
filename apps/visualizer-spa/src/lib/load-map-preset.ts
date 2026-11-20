/**
 * Путь загрузки карты из каталога (MapToolbar, App, тесты).
 * Порядок: fetch → setBaseUrlOverride → loadUnknownJson → setMode('live');
 * store обязан сохранить absolute multi-host URL (korbor-all).
 */

/** Откуда грузить карту: JSON и dev-сервер приложения. */
export type MapSource = {
  readonly path: string;
  readonly baseUrl: string;
};

/** Действия store, которые дергает UI при выборе карты. */
export type MapPresetStoreActions = {
  readonly setBaseUrlOverride: (url: string) => void;
  /** true — документ разобран и загружен */
  readonly loadUnknownJson: (raw: unknown) => boolean;
  readonly setMode: (mode: 'live') => void;
};

/** Результат загрузки. */
export type LoadMapResult =
  | { readonly ok: true; readonly json: unknown }
  | { readonly ok: false; readonly error: string };

/**
 * Загружает JSON карты с HTTP-проверкой (404 — ошибка, не тишина).
 *
 * @param path - URL карты
 * @param fetchFn - fetch (подменяется в тестах)
 */
export async function fetchMapJson(
  path: string,
  fetchFn: typeof fetch = fetch,
): Promise<LoadMapResult> {
  try {
    const res = await fetchFn(path);
    if (!res.ok) {
      return { ok: false, error: `Не удалось загрузить ${path}: HTTP ${res.status}` };
    }
    const json: unknown = await res.json();
    return { ok: true, json };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Сеть: ${path} — ${message}` };
  }
}

/**
 * Применяет уже загруженный JSON так же, как кнопка карты.
 *
 * @param source - карта (baseUrl уйдёт в override)
 * @param json - тело liveappmap / appmap
 * @param actions - сеттеры store
 */
export function applyLoadedMapPreset(
  source: MapSource,
  json: unknown,
  actions: MapPresetStoreActions,
): LoadMapResult {
  actions.setBaseUrlOverride(source.baseUrl);
  if (!actions.loadUnknownJson(json)) {
    return { ok: false, error: `Карта ${source.path} не разобрана` };
  }
  actions.setMode('live');
  return { ok: true, json };
}

/**
 * fetch + applyLoadedMapPreset — полный путь выбора карты.
 *
 * @param source - запись каталога или пресет
 * @param actions - store actions
 * @param fetchFn - fetch (подменяется в тестах)
 */
export async function loadMapPresetIntoStore(
  source: MapSource,
  actions: MapPresetStoreActions,
  fetchFn: typeof fetch = fetch,
): Promise<LoadMapResult> {
  const res = await fetchMapJson(source.path, fetchFn);
  return res.ok ? applyLoadedMapPreset(source, res.json, actions) : res;
}
