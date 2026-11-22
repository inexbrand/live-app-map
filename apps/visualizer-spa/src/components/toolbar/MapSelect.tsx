/**
 * Селект карты в шапке: карты каталога и действия «открыть файл», «очистить».
 */
import type { MapCatalogEntry } from '../../lib/map-catalog';
import { useAppStore } from '../../store/app-store';
import { Select } from '../../ui';
import { catalogLabel, FILE_MAP_ID, MAP_FILE_INPUT_ID, type MapLoader } from './use-map-loader';

const OPEN_FILE = '__open_file__';
const CLEAR = '__clear__';

/**
 * Выбор в селекте: id карты или действие.
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

/** Props селекта карты. */
export type MapSelectProps = {
  readonly catalog: readonly MapCatalogEntry[];
  readonly catalogLoading: boolean;
  readonly loader: MapLoader;
};

/**
 * Селект карты.
 *
 * @param props - каталог и загрузчик карт
 */
export function MapSelect(props: MapSelectProps) {
  const { catalog, catalogLoading, loader } = props;
  const hasDocument = useAppStore((s) => s.document !== null);
  const choose = (value: string): void => chooseMap(value, catalog, loader);

  return (
    <label className="toolbar-map-select" title="Выбор карты / действия">
      <span className="sr-only">Карта</span>
      <Select
        aria-label="Карта"
        data-testid="map-select"
        value={loader.activeMapId}
        disabled={catalogLoading || loader.loadingPresetId !== null}
        onChange={(e) => choose(e.target.value)}
      >
        <option value="">{catalogLoading ? 'Каталог…' : 'Выберите карту…'}</option>
        {catalog.map((c) => (
          <option key={c.id} value={c.id}>
            {catalogLabel(c)}
          </option>
        ))}
        {loader.source?.kind === 'file' ? (
          <option value={FILE_MAP_ID} disabled>
            Файл: {loader.source.name}
          </option>
        ) : null}
        <option value={OPEN_FILE}>── Открыть JSON / .appmap ──</option>
        <option value={CLEAR} disabled={!hasDocument}>
          ── Очистить карту ──
        </option>
      </Select>
    </label>
  );
}