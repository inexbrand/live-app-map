/**
 * Лист «Источники карты»: файл, каталог public/maps, очистка холста.
 */
import { Eraser, FolderOpen } from 'lucide-react';
import type { MapCatalogEntry } from '../../lib/map-catalog';
import { useAppStore } from '../../store/app-store';
import { Button } from '../../ui';
import { EdgeSheet } from '../EdgeSheet';
import { catalogLabel, MAP_FILE_INPUT_ID, type MapLoader } from './use-map-loader';

/** Props листа источников. */
export type SourcesSheetProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly catalog: readonly MapCatalogEntry[];
  readonly catalogLoading: boolean;
  readonly loader: MapLoader;
};

/**
 * Лист источников.
 *
 * @param props - открыт ли, каталог и загрузчик карт
 */
export function SourcesSheet(props: SourcesSheetProps) {
  const { open, onClose, catalog, catalogLoading, loader } = props;
  const hasDocument = useAppStore((s) => s.document !== null);
  const setToast = useAppStore((s) => s.setToast);
  return (
    <EdgeSheet open={open} side="left" title="Источники карты" description="Файл, карта из каталога public/maps или очистка холста." onClose={onClose}>
      <label htmlFor={MAP_FILE_INPUT_ID} className="ui-btn ui-btn--primary source-file-btn">
        <FolderOpen size={16} strokeWidth={1.75} aria-hidden={true} />
        Открыть JSON / .appmap
      </label>

      <div className="sheet-block">
        <div className="ui-field__label">Каталог карт</div>
        <div className="sheet-stack">
          {catalogLoading ? <p className="drawer__hint">Загрузка каталога…</p> : null}
          {!catalogLoading && catalog.length === 0 ? (
            <p className="drawer__hint">Каталог пуст. Положите *.liveappmap.json в public/maps.</p>
          ) : null}
          {catalog.map((p) => {
            const busy = loader.loadingPresetId === p.id;
            return (
              <Button key={p.id} type="button" variant="outline" disabled={loader.loadingPresetId !== null} aria-busy={busy} onClick={() => void loader.loadPreset(p)}>
                {busy ? 'Загрузка…' : catalogLabel(p)}
              </Button>
            );
          })}
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        disabled={!hasDocument}
        onClick={() => {
          loader.clear();
          onClose();
          setToast('Карта очищена');
        }}
      >
        <Eraser size={16} strokeWidth={1.75} />
        Очистить карту
      </Button>
    </EdgeSheet>
  );
}
