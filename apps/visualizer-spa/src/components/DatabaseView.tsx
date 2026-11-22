/**
 * Вид «База данных»: таблицы схемы, их колонки и связи, роуты, которые
 * читают и пишут таблицу, и экраны, которые эти роуты вызывают.
 */
import { useMemo, useState } from 'react';
import { shortSummary } from '@live-app-map/graph';
import type { DbColumn } from '@live-app-map/schema';
import { dbIndexOf, tableRows, tableView, type RouteUse } from '../lib/db-view-model';
import { useAppStore } from '../store/app-store';
import { useViewStore } from '../store/view-store';
import { Badge, Button, Input } from '../ui';

/** Признаки колонки одной строкой: PK, NOT NULL, UNIQUE, default, enum. */
function columnFlags(c: DbColumn): string {
  return [
    c.primaryKey === true ? 'PK' : '',
    c.notNull === true ? 'NOT NULL' : '',
    c.unique === true ? 'UNIQUE' : '',
    c.default === undefined ? '' : `= ${c.default}`,
    c.enumValues === undefined ? '' : `одно из: ${c.enumValues.join(', ')}`,
  ]
    .filter((s) => s !== '')
    .join(' · ');
}

/** Сколько роутов показать в списке сразу. */
const ROUTES_SHOWN = 8;

/** Описание таблицы: четыре строки, остальное по кнопке. */
function TableDoc(props: { readonly text: string }) {
  const [full, setFull] = useState(false);
  const long = props.text.length > 360;
  return (
    <div className="db-view__doc-wrap">
      <p className={`db-view__doc${long && !full ? ' db-view__doc--clamp' : ''}`}>{props.text}</p>
      {long ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => setFull(!full)}>
          {full ? 'Свернуть' : 'Показать полностью'}
        </Button>
      ) : null}
    </div>
  );
}

/** Экран, который вызывает роут: переход на холст (без ноды — неактивен). */
function ScreenChip(props: { readonly screen: RouteUse['screens'][number] }) {
  const s = props.screen;
  const selectPage = useAppStore((st) => st.selectPage);
  const setView = useViewStore((st) => st.setView);
  const nodeId = s.nodeId;
  return (
    <button
      disabled={nodeId === undefined}
      type="button"
      className="ui-chip"
      title={s.file}
      onClick={() => {
        if (nodeId !== undefined) {
          setView('screens');
          selectPage(nodeId);
        }
      }}
    >
      {s.title}
    </button>
  );
}

/** Роут, который трогает таблицу: переход в «API», описание, экраны. */
function RouteUseItem(props: { readonly use: RouteUse }) {
  const { route, screens } = props.use;
  const openRoute = useViewStore((s) => s.openRoute);
  const summary = shortSummary(route.doc, route.comments);
  return (
    <li>
      <button type="button" className="db-view__link" title="Открыть роут в виде «API»" onClick={() => openRoute(route.id)} data-testid="db-route-link">
        <code>
          {route.method} {route.path}
        </code>
      </button>
      {summary !== undefined ? <div className="db-view__route-doc">{summary}</div> : null}
      {screens.length > 0 ? (
        <div className="db-view__screens">
          {screens.map((s) => (
            <ScreenChip key={s.nodeId ?? s.file} screen={s} />
          ))}
        </div>
      ) : null}
    </li>
  );
}

/** Список роутов с экранами. */
function RouteList(props: { readonly title: string; readonly uses: readonly RouteUse[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? props.uses : props.uses.slice(0, ROUTES_SHOWN);
  return (
    <section className="db-view__section">
      <h3>
        {props.title} <span className="db-view__count">{props.uses.length}</span>
      </h3>
      {props.uses.length === 0 ? <p className="drawer__hint">Ни один роут не {props.title === 'Читают' ? 'читает' : 'пишет'} эту таблицу.</p> : null}
      <ul className="db-view__routes">
        {shown.map((u) => (
          <RouteUseItem key={u.route.id} use={u} />
        ))}
      </ul>
      {props.uses.length > ROUTES_SHOWN ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => setAll(!all)}>
          {all ? 'Свернуть' : `Показать ещё ${props.uses.length - ROUTES_SHOWN}`}
        </Button>
      ) : null}
    </section>
  );
}

type DbIndex = NonNullable<ReturnType<typeof dbIndexOf>>;
type TableViewModel = NonNullable<ReturnType<typeof tableView>>;

/** Список таблиц с поиском. */
function TableList(props: { readonly rows: ReturnType<typeof tableRows>; readonly current: string | null; readonly query: string; readonly setQuery: (q: string) => void }) {
  const openTable = useViewStore((s) => s.openTable);
  const { rows, current } = props;
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

/** Строка колонки: имя, тип, признаки, ссылка на другую таблицу. */
function ColumnRow(props: { readonly column: DbColumn }) {
  const c = props.column;
  const openTable = useViewStore((s) => s.openTable);
  const ref = c.references;
  return (
    <tr>
      <td className="font-mono" title={c.doc}>
        {c.sqlName ?? c.name}
      </td>
      <td className="font-mono">{c.type}</td>
      <td>{columnFlags(c)}</td>
      <td>
        {ref === undefined ? null : (
          <button type="button" className="db-view__link" onClick={() => openTable(ref.table)}>
            → {ref.table}.{ref.column}
            {ref.onDelete === undefined ? '' : ` (on delete ${ref.onDelete})`}
          </button>
        )}
      </td>
    </tr>
  );
}

/** Кто ссылается на таблицу. */
function ReferencedBy(props: { readonly refs: TableViewModel['referencedBy'] }) {
  const openTable = useViewStore((s) => s.openTable);
  return (
    <section className="db-view__section">
      <h3>
        На неё ссылаются <span className="db-view__count">{props.refs.length}</span>
      </h3>
      {props.refs.length === 0 ? <p className="drawer__hint">Другие таблицы на неё не ссылаются.</p> : null}
      <div className="db-view__screens">
        {props.refs.map((r) => (
          <button key={`${r.table}.${r.column}`} type="button" className="ui-chip" onClick={() => openTable(r.table)}>
            {r.table}.{r.column}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Таблица: шапка, описание, колонки, ссылки, роуты. */
function TableDetail(props: { readonly view: TableViewModel }) {
  const { view } = props;
  return (
    <main className="db-view__detail" data-testid="db-table">
      <header className="db-view__head">
        <h2>{view.table.name}</h2>
        <Badge>{view.table.orm}</Badge>
        {view.service === undefined ? null : <Badge>{view.service.name}</Badge>}
        <span className="drawer__hint font-mono">
          {view.table.location.file}:{view.table.location.line}
        </span>
      </header>
      {view.table.doc === undefined ? null : <TableDoc key={view.table.id} text={view.table.doc} />}

      <section className="db-view__section">
        <h3>
          Колонки <span className="db-view__count">{view.table.columns.length}</span>
        </h3>
        <table className="db-view__columns">
          <thead>
            <tr>
              <th>Колонка</th>
              <th>Тип</th>
              <th>Свойства</th>
              <th>Ссылка</th>
            </tr>
          </thead>
          <tbody>
            {view.table.columns.map((c) => (
              <ColumnRow key={c.name} column={c} />
            ))}
          </tbody>
        </table>
      </section>

      <ReferencedBy refs={view.referencedBy} />

      <RouteList title="Читают" uses={view.readRoutes} />
      <RouteList title="Пишут" uses={view.writeRoutes} />
    </main>
  );
}

/** Таблица для показа: выбранная или первая из списка. */
function currentTable(index: DbIndex, selected: string | null, rows: ReturnType<typeof tableRows>): TableViewModel | null {
  const current = selected ?? rows[0]?.exportName ?? null;
  return current === null ? null : tableView(index, current);
}

/** Схема с таблицами. */
function DatabaseLayout(props: { readonly index: DbIndex }) {
  const selected = useViewStore((s) => s.table);
  const [query, setQuery] = useState('');
  const rows = useMemo(() => tableRows(props.index, query), [props.index, query]);
  const view = currentTable(props.index, selected, rows);
  return (
    <div className="db-view" data-testid="database-view">
      <TableList rows={rows} current={selected ?? rows[0]?.exportName ?? null} query={query} setQuery={setQuery} />
      {view === null ? null : <TableDetail view={view} />}
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
        <p>В карте нет схемы базы данных: карту сняли без исходников. Пересканируйте проект с параметром <code>--code-dir</code>.</p>
      </div>
    );
  }
  return <DatabaseLayout index={index} />;
}
