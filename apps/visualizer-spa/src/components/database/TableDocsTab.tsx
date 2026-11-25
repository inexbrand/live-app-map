/**
 * Вкладка «Документация» таблицы: описание, колонки, кто ссылается, роуты чтения
 * и записи с экранами, документы и эпохи, где упомянута таблица.
 */
import { useMemo, useState } from 'react';
import { shortSummary } from '@live-app-map/graph';
import type { DbColumn } from '@live-app-map/schema';
import { tableDocs, type RouteUse, type TableView } from '../../lib/db-view-model';
import { NODE_KIND_SINGULAR } from '../../lib/doc-graph';
import { useDocGraph, useOpenGraphNode } from '../../lib/use-doc-graph';
import { useAppStore } from '../../store/app-store';
import { useViewStore } from '../../store/view-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/** Признаки колонки одной строкой: PK, NOT NULL, UNIQUE, default, enum. */
export function columnFlags(c: DbColumn): string {
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
    <Button
      variant="outline"
      size="xs"
      disabled={nodeId === undefined}
      title={s.file}
      onClick={() => {
        if (nodeId !== undefined) {
          setView('screens');
          selectPage(nodeId);
        }
      }}
    >
      {s.title}
    </Button>
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
function RouteList(props: { readonly title: string; readonly empty: string; readonly uses: readonly RouteUse[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? props.uses : props.uses.slice(0, ROUTES_SHOWN);
  return (
    <section className="db-view__section">
      <h3>
        {props.title} <span className="db-view__count">{props.uses.length}</span>
      </h3>
      {props.uses.length === 0 ? <p className="drawer__hint">{props.empty}</p> : null}
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

/** Строка колонки: имя, тип, признаки, ссылка на другую таблицу. */
function ColumnRow(props: { readonly column: DbColumn; readonly onOpenTable: (exportName: string) => void }) {
  const c = props.column;
  const openTable = props.onOpenTable;
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
function ReferencedBy(props: { readonly refs: TableView['referencedBy']; readonly onOpenTable: (exportName: string) => void }) {
  const openTable = props.onOpenTable;
  return (
    <section className="db-view__section">
      <h3>
        На неё ссылаются <span className="db-view__count">{props.refs.length}</span>
      </h3>
      {props.refs.length === 0 ? <p className="drawer__hint">Другие таблицы на неё не ссылаются.</p> : null}
      <div className="db-view__screens">
        {props.refs.map((r) => (
          <Button key={`${r.table}.${r.column}`} variant="outline" size="xs" onClick={() => openTable(r.table)}>
            {r.table}.{r.column}
          </Button>
        ))}
      </div>
    </section>
  );
}

/** Документы и эпохи, где упомянута таблица. */
function MentionedIn(props: { readonly exportName: string }) {
  const graph = useDocGraph();
  const open = useOpenGraphNode();
  const docs = useMemo(() => tableDocs(graph, props.exportName), [graph, props.exportName]);
  return (
    <section className="db-view__section" data-testid="db-table-docs">
      <h3>
        Упоминается в документах <span className="db-view__count">{docs.length}</span>
      </h3>
      {docs.length === 0 ? <p className="drawer__hint">Ни один документ не ссылается на эту таблицу.</p> : null}
      <ul className="db-view__routes">
        {docs.map((d) => (
          <li key={d.id}>
            <button type="button" className="db-view__link" title={d.detail} onClick={() => open(d)}>
              {d.label}
            </button>{' '}
            <span className="drawer__hint">{NODE_KIND_SINGULAR.get(d.kind)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Вкладка «Документация».
 *
 * @param props - таблица и переход к другой таблице (родитель спрашивает про несохранённые правки)
 */
export function TableDocsTab(props: { readonly view: TableView; readonly onOpenTable: (exportName: string) => void }) {
  const { view } = props;
  return (
    <div className="db-view__detail" data-testid="db-table">
      <header className="db-view__head">
        <h2>{view.table.name}</h2>
        <Badge variant="secondary">{view.table.orm}</Badge>
        {view.service === undefined ? null : <Badge variant="secondary">{view.service.name}</Badge>}
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
              <ColumnRow key={c.name} column={c} onOpenTable={props.onOpenTable} />
            ))}
          </tbody>
        </table>
      </section>
      <ReferencedBy refs={view.referencedBy} onOpenTable={props.onOpenTable} />
      <RouteList title="Читают" empty="Ни один роут не читает эту таблицу." uses={view.readRoutes} />
      <RouteList title="Пишут" empty="Ни один роут не пишет эту таблицу." uses={view.writeRoutes} />
      <MentionedIn exportName={view.table.exportName} />
    </div>
  );
}
