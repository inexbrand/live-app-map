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
  const activeMapId = source === null ? '' : source.kind === 'catalog' ? source.id : FILE_MAP_ID;

  // Карта открыта ссылкой (?map=…): селект показывает её, а не «Выберите карту…».
  useEffect(() => {
    if (activeMapId !== '' || catalog.length === 0) {
      return;
    }
    const mapParam = new URLSearchParams(window.location.search).get('map');
    const hit = mapParam === null ? undefined : catalog.find((c) => c.path === mapParam);
    if (hit !== undefined) {
      setSource({ kind: 'catalog', id: hit.id, label: hit.label, path: hit.path });
    }
  }, [catalog, activeMapId, setSource]);

  const openFile = async (file: File | null): Promise<void> => {
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
  };

  /**
   * Если нет dogfood-сессии — mint первого admin + первого user с telegramId.
   * Без этого admin всегда login, miniapp «не открывается» (не Telegram).
   */
  const mintMissingDogfood = async (): Promise<void> => {
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
  };

  const loadPreset = async (preset: MapCatalogEntry): Promise<void> => {
    setLoadingPresetId(preset.id);
    const app = useAppStore.getState();
    try {
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
        return;
      }
      setSource({ kind: 'catalog', id: preset.id, label: preset.label, path: preset.path });
      await mintMissingDogfood();
      const baseHint = preset.baseUrl.trim() !== '' ? ` · ${preset.baseUrl}` : '';
      app.setToast(`Загружено: ${preset.label}${baseHint}`);
      done();
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
