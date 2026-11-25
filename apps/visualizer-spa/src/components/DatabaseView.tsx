/**
 * Вид «База данных» как Drizzle Studio: слева таблицы, в центре ER-схема всех
 * таблиц, под ней данные выбранной таблицы (тестовая БД), справа документация
 * и код объявления. Границы панелей тянутся, раскладка запоминается.
 */
import { useCallback, useMemo, useState } from 'react';
import { useDefaultLayout } from 'react-resizable-panels';
import { dbIndexOf, tableRows, tableView } from '../lib/db-view-model';
import { useAppStore } from '../store/app-store';
import { useViewStore } from '../store/view-store';
import { confirmDiscard, DataGrid } from './database/DataGrid';
import { ErdCanvas } from './database/ErdCanvas';
import { TableCodeTab } from './database/TableCodeTab';
import { TableDocsTab } from './database/TableDocsTab';
import { Input } from '@/components/ui/input';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type DbIndex = NonNullable<ReturnType<typeof dbIndexOf>>;
type TableViewModel = NonNullable<ReturnType<typeof tableView>>;

/** Список таблиц с поиском. */
function TableList(props: {
  readonly rows: ReturnType<typeof tableRows>;
  readonly current: string | null;
  readonly query: string;
  readonly setQuery: (q: string) => void;
  readonly onOpenTable: (exportName: string) => void;
}) {
  const { rows, current, onOpenTable: openTable } = props;
  return (
    <aside className="db-view__list">
      <h3 className="db-view__list-title">
        Таблицы <span className="db-view__count">{rows.length}</span>
      </h3>
      <Input id="db-search" aria-label="Поиск таблиц" value={props.query} placeholder="Таблица, колонка, описание" onChange={(e) => props.setQuery(e.target.value)} />
      <ul>
        {rows.map((r) => (
          <li key={r.exportName}>
            <button type="button" className={`db-view__row${r.exportName === current ? ' db-view__row--on' : ''}`} onClick={() => openTable(r.exportName)} title={r.doc ?? r.name}>
              <span className="db-view__name">{r.name}</span>
              <span className="db-view__meta">
                {r.columns} кол. · чтение {r.reads} · запись {r.writes}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** Правая панель: «Документация» и «Схема в коде». */
function TableSide(props: { readonly view: TableViewModel; readonly onOpenTable: (exportName: string) => void }) {
  const [tab, setTab] = useState<string>('docs');
  return (
    <Tabs value={tab} onValueChange={(v: string) => setTab(v)} className="db-view__side">
      <TabsList>
        <TabsTrigger value="docs">Документация</TabsTrigger>
        <TabsTrigger value="code">Схема в коде</TabsTrigger>
      </TabsList>
      <TabsContent value="docs" className="db-view__tab">
        <TableDocsTab view={props.view} onOpenTable={props.onOpenTable} />
      </TabsContent>
      <TabsContent value="code" className="db-view__tab">
        <TableCodeTab table={props.view.table} />
      </TabsContent>
    </Tabs>
  );
}

/** Раскладка панелей, запомненная в localStorage. */
function useSavedLayout(id: string) {
  return useDefaultLayout({ id, storage: localStorage, onlySaveAfterUserInteractions: true });
}

/** Центр: схема сверху, данные снизу. */
function CenterPanels(props: {
  readonly index: DbIndex;
  readonly current: TableViewModel | null;
  readonly onOpenTable: (exportName: string) => void;
  readonly onDirtyChange: (count: number) => void;
}) {
  const layout = useSavedLayout('lam-db-center');
  const exportName = props.current?.table.exportName ?? null;
  return (
    <ResizablePanelGroup orientation="vertical" id="lam-db-center" defaultLayout={layout.defaultLayout} onLayoutChanged={layout.onLayoutChanged}>
      <ResizablePanel id="erd" defaultSize="55%" minSize={120}>
        <ErdCanvas tables={props.index.code.tables} selected={exportName} onSelect={props.onOpenTable} />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="data" defaultSize="45%" minSize={96}>
        <div className="db-view__data" data-testid="db-data">
          {props.current === null ? <p className="drawer__hint">Выберите таблицу слева или на схеме.</p> : <DataGrid key={props.current.table.name} table={props.current.table.name} onDirtyChange={props.onDirtyChange} />}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

/** Схема с таблицами. */
function DatabaseLayout(props: { readonly index: DbIndex }) {
  const selected = useViewStore((s) => s.table);
  const [query, setQuery] = useState('');
  const rows = useMemo(() => tableRows(props.index, query), [props.index, query]);
  const currentName = selected ?? rows[0]?.exportName ?? null;
  const view = currentName === null ? null : tableView(props.index, currentName);
  const layout = useSavedLayout('lam-db-main');
  const openTable = useViewStore((s) => s.openTable);
  const [dirty, setDirty] = useState(0);
  // Смена таблицы отбрасывает правки сетки: одно место, где спрашивается подтверждение
  const selectTable = useCallback(
    (exportName: string) => {
      if (exportName === currentName || !confirmDiscard(dirty)) {
        return;
      }
      setDirty(0);
      openTable(exportName);
    },
    [currentName, dirty, openTable],
  );
  return (
    <div className="db-view" data-testid="database-view">
      <ResizablePanelGroup orientation="horizontal" id="lam-db-main" defaultLayout={layout.defaultLayout} onLayoutChanged={layout.onLayoutChanged}>
        <ResizablePanel id="list" defaultSize="18%" minSize={160}>
          <TableList rows={rows} current={currentName} query={query} setQuery={setQuery} onOpenTable={selectTable} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="center" defaultSize="52%" minSize={320}>
          <CenterPanels index={props.index} current={view} onOpenTable={selectTable} onDirtyChange={setDirty} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="side" defaultSize="30%" minSize={260}>
          {view === null ? null : <TableSide view={view} onOpenTable={selectTable} />}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

/** Вид «База данных». */
export function DatabaseView() {
  const document = useAppStore((s) => s.document);
  const index = useMemo(() => dbIndexOf(document), [document]);
  if (index === null) {
    return (
      <div className="db-view db-view--empty" data-testid="database-view">
        <p>
          В карте нет схемы базы данных: карту сняли без исходников. Пересканируйте проект с параметром <code>--code-dir</code>.
        </p>
      </div>
    );
  }
  return <DatabaseLayout index={index} />;
}
