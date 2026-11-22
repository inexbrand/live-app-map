/**
 * Открытие карты из шапки: каталог, файл, очистка; выбранная карта в селекте.
 */
import { useEffect, useState } from 'react';
import { ensureDogfoodSessions } from '../../lib/ensure-dogfood-sessions';
import { importMapFile } from '../../lib/import-map';
import { loadMapPresetIntoStore } from '../../lib/load-map-preset';
import type { MapCatalogEntry } from '../../lib/map-catalog';
import { useAppStore } from '../../store/app-store';
import { useMapSourceStore, type MapSourceRef } from '../../store/map-source-store';
import type { DogfoodActorsState } from './use-dogfood-actors';

/** id поля выбора файла карты (одно на страницу, вне листа «Источники»). */
export const MAP_FILE_INPUT_ID = 'lam-file-input';

/** Значение селекта для карты из файла. */
export const FILE_MAP_ID = '__file__';

/** Что умеет шапка с картами. */
export type MapLoader = {
  readonly source: MapSourceRef | null;
  /** Значение селекта: id каталога, `__file__` или пусто. */
  readonly activeMapId: string;
  /** id карты каталога, которая сейчас грузится. */
  readonly loadingPresetId: string | null;
  readonly loadPreset: (preset: MapCatalogEntry) => Promise<void>;
  readonly openFile: (file: File | null) => Promise<void>;
  /** Очистить холст и выбор карты. */
  readonly clear: () => void;
};

/** Значение селекта для источника карты. */
function activeMapIdOf(source: MapSourceRef | null): string {
  if (source === null) {
    return '';
  }
  return source.kind === 'catalog' ? source.id : FILE_MAP_ID;
}

/** Карта каталога из ссылки ?map=…, если она есть в каталоге. */
function mapFromLink(catalog: readonly MapCatalogEntry[]): MapCatalogEntry | undefined {
  const mapParam = new URLSearchParams(window.location.search).get('map');
  return mapParam === null ? undefined : catalog.find((c) => c.path === mapParam);
}

/** Источник для записи каталога. */
function catalogSource(entry: MapCatalogEntry): MapSourceRef {
  return { kind: 'catalog', id: entry.id, label: entry.label, path: entry.path };
}

/**
 * Открыть карту из файла.
 *
 * @param file - выбранный файл (null — выбор отменён)
 * @param setSource - запомнить источник
 * @param done - после загрузки
 */
async function openMapFile(file: File | null, setSource: (s: MapSourceRef) => void, done: () => void): Promise<void> {
  if (!file) {
    return;
  }
  const result = await importMapFile(file);
  const app = useAppStore.getState();
  if (!result.ok) {
    app.setLastLoadError(result.error);
    app.setToast(result.error);
    return;
  }
  if (app.loadUnknownJson(result.json)) {
    setSource({ kind: 'file', name: file.name });
  }
  if (result.toast !== undefined) {
    app.setToast(result.toast);
  }
  done();
}

/**
 * Если нет dogfood-сессии — mint первого admin + первого user с telegramId.
 * Без этого admin всегда login, miniapp «не открывается» (не Telegram).
 */
async function mintMissingDogfood(dogfood: DogfoodActorsState): Promise<void> {
  const app = useAppStore.getState();
  await ensureDogfoodSessions({
    dogfoodAdminAccessToken: app.dogfoodAdminAccessToken,
    dogfoodMiniappInitData: app.dogfoodMiniappInitData,
    setDogfoodAdminAccessToken: app.setDogfoodAdminAccessToken,
    setDogfoodMiniappInitData: app.setDogfoodMiniappInitData,
    setGlobalRole: app.setGlobalRole,
    onActors: (actors) => {
      dogfood.setActors(actors);
      dogfood.setError(null);
    },
    onError: (message) => dogfood.setError(message),
    onToast: app.setToast,
  });
}

/**
 * Загрузить карту каталога: proxy, карта в store, источник, вход dogfood, toast.
 *
 * @returns true — карта загружена
 */
async function loadCatalogMap(preset: MapCatalogEntry, dogfood: DogfoodActorsState, setSource: (s: MapSourceRef) => void): Promise<boolean> {
  const app = useAppStore.getState();
  // iframe dogfood: proxy всегда нужен (frame-bypass + TLS)
  if (!app.useTlsProxy) {
    app.setUseTlsProxy(true);
  }
  const res = await loadMapPresetIntoStore(preset, {
    setBaseUrlOverride: app.setBaseUrlOverride,
    loadUnknownJson: app.loadUnknownJson,
    setMode: app.setMode,
  });
  if (!res.ok) {
    app.setLastLoadError(res.error);
    app.setToast(res.error);
    return false;
  }
  setSource(catalogSource(preset));
  await mintMissingDogfood(dogfood);
  const baseHint = preset.baseUrl.trim() !== '' ? ` · ${preset.baseUrl}` : '';
  app.setToast(`Загружено: ${preset.label}${baseHint}`);
  return true;
}

/**
 * Загрузка карт шапки.
 *
 * @param catalog - каталог /maps/index.json
 * @param dogfood - пользователи dev-входа (заполняются при входе после загрузки)
 * @param done - после успешной загрузки (закрыть лист)
 */
export function useMapLoader(catalog: readonly MapCatalogEntry[], dogfood: DogfoodActorsState, done: () => void): MapLoader {
  const source = useMapSourceStore((s) => s.source);
  const setSource = useMapSourceStore((s) => s.setSource);
  const [loadingPresetId, setLoadingPresetId] = useState<string | null>(null);
  const activeMapId = activeMapIdOf(source);

  // Карта открыта ссылкой (?map=…): селект показывает её, а не «Выберите карту…».
  useEffect(() => {
    const hit = activeMapId === '' ? mapFromLink(catalog) : undefined;
    if (hit !== undefined) {
      setSource(catalogSource(hit));
    }
  }, [catalog, activeMapId, setSource]);

  const openFile = (file: File | null): Promise<void> => openMapFile(file, setSource, done);

  const loadPreset = async (preset: MapCatalogEntry): Promise<void> => {
    setLoadingPresetId(preset.id);
    try {
      if (await loadCatalogMap(preset, dogfood, setSource)) {
        done();
      }
    } finally {
      setLoadingPresetId(null);
    }
  };

  const clear = (): void => {
    useAppStore.getState().clearMap();
    setSource(null);
  };

  return { source, activeMapId, loadingPresetId, loadPreset, openFile, clear };
}

/**
 * Подпись карты каталога: имя и число экранов.
 *
 * @param entry - карта каталога
 */
export function catalogLabel(entry: MapCatalogEntry): string {
  return `${entry.label}${entry.pageCount > 0 ? ` · ${entry.pageCount} экр.` : ''}`;
}
