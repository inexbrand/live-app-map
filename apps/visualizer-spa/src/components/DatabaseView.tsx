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
import { Badge, Input } from '../ui';

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

/** Список роутов с экранами. */
function RouteList(props: { readonly title: string; readonly uses: readonly RouteUse[] }) {
  const selectPage = useAppStore((s) => s.selectPage);
  const setView = useViewStore((s) => s.setView);
  return (
    <section className="db-view__section">
      <h3>
        {props.title} <span className="db-view__count">{props.uses.length}</span>
      </h3>
      {props.uses.length === 0 ? <p className="drawer__hint">Нет роутов.</p> : null}
      <ul className="db-view__routes">
        {props.uses.map(({ route, screens }) => (
          <li key={route.id}>
            <code>
              {route.method} {route.path}
            </code>
            {shortSummary(route.doc, route.comments) !== undefined ? <div className="drawer__hint">{shortSummary(route.doc, route.comments)}</div> : null}
            {screens.length > 0 ? (
              <div className="db-view__screens">
                {screens.map((s) => (
                  <button
                    key={s.nodeId ?? s.file}
                    disabled={s.nodeId === undefined}
                    type="button"
                    className="ui-chip"
                    title={s.file}
                    onClick={() => {
                      if (s.nodeId !== undefined) {
                        setView('screens');
                        selectPage(s.nodeId);
                      }
                    }}
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Вид «База данных». */
export function DatabaseView() {
  const document = useAppStore((s) => s.document);
  const index = useMemo(() => dbIndexOf(document), [document]);
  const selected = useViewStore((s) => s.table);
  const openTable = useViewStore((s) => s.openTable);
  const [query, setQuery] = useState('');
  const rows = useMemo(() => (index === null ? [] : tableRows(index, query)), [index, query]);
  const current = selected ?? rows[0]?.exportName ?? null;
  const view = index === null || current === null ? null : tableView(index, current);

  if (index === null) {
    return (
      <div className="db-view db-view--empty" data-testid="database-view">
        <p>В карте нет схемы БД. Сканируйте с исходниками: <code>scan --code-dir</code>.</p>
      </div>
    );
  }

  return (
    <div className="db-view" data-testid="database-view">
      <aside className="db-view__list">
        <h3 className="db-view__list-title">
          Таблицы <span className="db-view__count">{rows.length}</span>
        </h3>
        <Input id="db-search" aria-label="Поиск таблиц" value={query} placeholder="Таблица, колонка, описание" onChange={(e) => setQuery(e.target.value)} />
        <ul>
          {rows.map((r) => (
            <li key={r.exportName}>
              <button
                type="button"
                className={`db-view__row${r.exportName === current ? ' db-view__row--on' : ''}`}
                onClick={() => openTable(r.exportName)}
                title={r.doc ?? r.name}
              >
                <span className="db-view__name">{r.name}</span>
                <span className="db-view__meta">
                  {r.columns} кол. · чтение {r.reads} · запись {r.writes}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      {view === null ? null : (
        <main className="db-view__detail" data-testid="db-table">
          <header className="db-view__head">
            <h2>{view.table.name}</h2>
            <Badge>{view.table.orm}</Badge>
            {view.service === undefined ? null : <Badge>{view.service.name}</Badge>}
            <span className="drawer__hint font-mono">
              {view.table.location.file}:{view.table.location.line}
            </span>
          </header>
          {view.table.doc === undefined ? null : <p className="db-view__doc">{view.table.doc}</p>}

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
                  <tr key={c.name}>
                    <td className="font-mono" title={c.doc}>
                      {c.sqlName ?? c.name}
                    </td>
                    <td className="font-mono">{c.type}</td>
                    <td>{columnFlags(c)}</td>
                    <td>
                      {c.references === undefined ? null : (
                        <button type="button" className="db-view__link" onClick={() => openTable(c.references?.table ?? '')}>
                          → {c.references.table}.{c.references.column}
                          {c.references.onDelete === undefined ? '' : ` (on delete ${c.references.onDelete})`}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="db-view__section">
            <h3>
              На неё ссылаются <span className="db-view__count">{view.referencedBy.length}</span>
            </h3>
            {view.referencedBy.length === 0 ? <p className="drawer__hint">Никто.</p> : null}
            <div className="db-view__screens">
              {view.referencedBy.map((r) => (
                <button key={`${r.table}.${r.column}`} type="button" className="ui-chip" onClick={() => openTable(r.table)}>
                  {r.table}.{r.column}
                </button>
              ))}
            </div>
          </section>

          <RouteList title="Читают" uses={view.readRoutes} />
          <RouteList title="Пишут" uses={view.writeRoutes} />
        </main>
      )}
    </div>
  );
}
