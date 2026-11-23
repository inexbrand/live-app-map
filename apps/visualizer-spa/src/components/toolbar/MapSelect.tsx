/**
 * Выбор карты в шапке: карты каталога и действия «открыть файл», «очистить».
 */
import type { MapCatalogEntry } from '../../lib/map-catalog';
import { useAppStore } from '../../store/app-store';
import { OptionSelect, type OptionItem } from '../option-select';
import { catalogLabel, FILE_MAP_ID, MAP_FILE_INPUT_ID, type MapLoader } from './use-map-loader';

const OPEN_FILE = '__open_file__';
const CLEAR = '__clear__';

/**
 * Выбор в списке: id карты или действие.
 *
 * @param value - значение пункта
 * @param catalog - каталог карт
 * @param loader - загрузчик карт шапки
 */
function chooseMap(value: string, catalog: readonly MapCatalogEntry[], loader: MapLoader): void {
  if (value === '' || value === loader.activeMapId) {
    return;
  }
  if (value === OPEN_FILE) {
    window.document.getElementById(MAP_FILE_INPUT_ID)?.click();
    return;
  }
  if (value === CLEAR) {
    loader.clear();
    useAppStore.getState().setToast('Карта очищена');
    return;
  }
  const preset = catalog.find((c) => c.id === value);
  if (preset) {
    void loader.loadPreset(preset);
  }
}

/** Props выбора карты. */
export type MapSelectProps = {
  readonly catalog: readonly MapCatalogEntry[];
  readonly catalogLoading: boolean;
  readonly loader: MapLoader;
};

/**
 * Выбор карты.
 *
 * @param props - каталог и загрузчик карт
 */
export function MapSelect(props: MapSelectProps) {
  const { catalog, catalogLoading, loader } = props;
  const hasDocument = useAppStore((s) => s.document !== null);
  const items: OptionItem[] = catalog.map((c) => ({ value: c.id, label: catalogLabel(c) }));
  if (loader.source?.kind === 'file') {
    items.push({ value: FILE_MAP_ID, label: `Файл: ${loader.source.name}`, disabled: true });
  }
  return (
    <OptionSelect
      aria-label="Карта"
      data-testid="map-select"
      className="w-60 max-[900px]:w-44"
      placeholder={catalogLoading ? 'Каталог…' : 'Выберите карту…'}
      items={items}
      actions={[
        { value: OPEN_FILE, label: 'Открыть JSON / .appmap' },
        { value: CLEAR, label: 'Очистить карту', disabled: !hasDocument },
      ]}
      value={loader.activeMapId}
      disabled={catalogLoading || loader.loadingPresetId !== null}
      onValueChange={(v) => chooseMap(v, catalog, loader)}
    />
  );
}
