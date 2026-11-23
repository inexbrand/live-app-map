/**
 * Шапка визуализатора: слева карта и вкладки видов, по центру поиск, справа замечания и листы
 * «Входы» и «Настройки» (тема — в настройках). Все подписи на русском.
 */
import { KeyRound, Search, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MapCatalogEntry } from '../lib/map-catalog';
import { useAppStore } from '../store/app-store';
import { useUiStore } from '../store/ui-store';
import { CommentsToolbarButton } from './comments/CommentsToolbarButton';
import { MapSelect } from './toolbar/MapSelect';
import { SettingsSheet } from './toolbar/SettingsSheet';
import { LoginsSheet } from './toolbar/LoginsSheet';
import { Kbd } from '@/components/ui/kbd';
import { ToolbarButton } from './toolbar/ToolbarButton';
import { useDogfoodActors } from './toolbar/use-dogfood-actors';
import { MAP_FILE_INPUT_ID, useMapLoader } from './toolbar/use-map-loader';
import { ViewTabs } from './toolbar/ViewTabs';

/** Лист у края экрана. */
type SheetId = 'logins' | 'settings' | null;

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
  const dogfood = useDogfoodActors(sheet === 'logins');
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
      <header className="flex items-center gap-3 border-b bg-background px-3 py-2" data-testid="toolbar">
        <div className="flex shrink-0 items-center gap-2">
          <MapSelect catalog={catalog} catalogLoading={catalogLoading} loader={loader} />
          {hasDocument ? <ViewTabs /> : null}
        </div>

        <div className="flex min-w-0 flex-1 justify-center">
        <button
          type="button"
          onClick={() => setPalette(true)}
          aria-label="Поиск по проекту"
          title="Поиск по экранам, роутам, таблицам, эпохам, документам и файлам (⌘K, /)"
          data-testid="open-palette"
          className="flex h-8 w-full max-w-[420px] min-w-0 items-center gap-2 rounded-lg border border-input bg-input/30 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-input/50"
        >
          <Search className="size-4" strokeWidth={1.75} />
          <span className="flex-1 truncate text-left">Поиск</span>
          <Kbd>⌘K</Kbd>
        </button>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2">
          {hasDocument ? <CommentsToolbarButton /> : null}
          <ToolbarButton
            icon={KeyRound}
            label="Входы"
            aria-label="Входы"
            title="Входы: под каким пользователем открываются экраны"
            selected={sheet === 'logins'}
            onClick={() => toggleSheet('logins')}
            aria-expanded={sheet === 'logins'}
          />
          <ToolbarButton
            icon={Settings2}
            label="Настройки"
            aria-label="Настройки"
            title="Настройки просмотра"
            selected={sheet === 'settings'}
            onClick={() => toggleSheet('settings')}
            aria-expanded={sheet === 'settings'}
          />
        </div>
        {/* Поле файла для пункта «Открыть JSON» селекта карты */}
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

      <LoginsSheet open={sheet === 'logins'} onClose={closeSheet} dogfood={dogfood} />
      <SettingsSheet open={sheet === 'settings'} onClose={closeSheet} />
    </>
  );
}
