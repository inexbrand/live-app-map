/**
 * Шапка визуализатора: выбор карты, вкладки видов, крошки, кнопки листов, тема, поиск.
 * Листы «Источники» и «Настройки» открываются по краям. Все подписи на русском.
 */
import { Layers, Search, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MapCatalogEntry } from '../lib/map-catalog';
import { useAppStore } from '../store/app-store';
import { useUiStore } from '../store/ui-store';
import { Breadcrumbs } from './Breadcrumbs';
import { CommentsToolbarButton } from './comments/CommentsToolbarButton';
import { MapSelect } from './toolbar/MapSelect';
import { SettingsSheet } from './toolbar/SettingsSheet';
import { SourcesSheet } from './toolbar/SourcesSheet';
import { ThemeToggle } from './toolbar/ThemeToggle';
import { ToolbarButton } from './toolbar/ToolbarButton';
import { useDogfoodActors } from './toolbar/use-dogfood-actors';
import { MAP_FILE_INPUT_ID, useMapLoader } from './toolbar/use-map-loader';
import { ViewTabs } from './toolbar/ViewTabs';

/** Лист у края экрана. */
type SheetId = 'sources' | 'settings' | null;

/** Props шапки: каталог из App (fetch /maps/index.json). */
export type MapToolbarProps = {
  readonly catalog: readonly MapCatalogEntry[];
  readonly catalogLoading?: boolean;
};

/**
 * Шапка визуализатора.
 *
 * @param props - каталог карт и состояние загрузки
 */
export function MapToolbar(props: MapToolbarProps) {
  const { catalog, catalogLoading = false } = props;
  const hasDocument = useAppStore((s) => s.document !== null);
  const setPalette = useUiStore((s) => s.setPalette);
  const [sheet, setSheet] = useState<SheetId>(null);
  const closeSheet = (): void => setSheet(null);
  const toggleSheet = (id: Exclude<SheetId, null>): void => setSheet(sheet === id ? null : id);
  const dogfood = useDogfoodActors(sheet === 'settings');
  const loader = useMapLoader(catalog, dogfood, closeSheet);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSheet(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <header className="toolbar toolbar--slim">
        <MapSelect catalog={catalog} catalogLoading={catalogLoading} loader={loader} />
        {hasDocument ? <ViewTabs /> : null}
        {hasDocument ? <Breadcrumbs /> : null}
        <div className="toolbar__spacer" />

        <div className="toolbar__group">
          {hasDocument ? <CommentsToolbarButton /> : null}
          <ToolbarButton
            icon={Layers}
            label="Источники"
            labelCollapses={false}
            selected={sheet === 'sources'}
            onClick={() => toggleSheet('sources')}
            aria-expanded={sheet === 'sources'}
          />
          <ToolbarButton
            icon={Settings2}
            label="Настройки"
            labelCollapses={false}
            selected={sheet === 'settings'}
            onClick={() => toggleSheet('settings')}
            aria-expanded={sheet === 'settings'}
          />
          <ThemeToggle />
          <ToolbarButton
            icon={Search}
            label="Поиск"
            onClick={() => setPalette(true)}
            aria-label="Поиск по проекту"
            title="Поиск по экранам, роутам, таблицам, эпохам, документам и файлам (⌘K, /)"
            data-testid="open-palette"
          >
            <kbd className="palette__kbd">⌘K</kbd>
          </ToolbarButton>
        </div>
        {/* Вне листа «Источники»: пункт «Открыть…» в селекте работает и при закрытом листе */}
        <input
          id={MAP_FILE_INPUT_ID}
          type="file"
          accept=".json,.appmap,.zip,application/json"
          hidden
          onChange={(e) => {
            void loader.openFile(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
        />
      </header>

      <SourcesSheet open={sheet === 'sources'} onClose={closeSheet} catalog={catalog} catalogLoading={catalogLoading} loader={loader} />
      <SettingsSheet open={sheet === 'settings'} onClose={closeSheet} dogfood={dogfood} />
    </>
  );
}
