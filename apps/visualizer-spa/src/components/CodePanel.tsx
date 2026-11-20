/**
 * Код ноды в правой панели: роуты сервиса с описанием и запросами в БД,
 * таблицы, функции и компоненты с комментариями.
 */
import { useState, type ReactElement } from 'react';
import type { ApiRoute, CodeSymbol, DbTable } from '@live-app-map/schema';
import { Badge, Field, Input } from '../ui';
import { groupDbCalls, type PageCodeView, type ServiceCodeView } from '../lib/node-code';
import { matchesCodeFilter } from '../lib/code-filter';

/** Сколько элементов списка показывать сразу. */
const LIST_LIMIT = 100;

/** Место в коде строкой `file:line`. */
function where(loc: { readonly file: string; readonly line: number }): string {
  return `${loc.file}:${loc.line}`;
}

/** Описание: первая строка сразу, остальное — по раскрытию. */
function Description(props: { readonly text: string | undefined }) {
  if (props.text === undefined) {
    return <p className="code-item__empty">Без комментария</p>;
  }
  const [first, ...rest] = props.text.split('\n');
  if (rest.length === 0) {
    return <p className="code-item__doc">{first}</p>;
  }
  return (
    <details className="code-item__details">
      <summary className="code-item__doc">{first}</summary>
      <pre className="code-item__more">{rest.join('\n').trim()}</pre>
    </details>
  );
}

function RouteItem(props: { readonly route: ApiRoute }) {
  const r = props.route;
  const db = groupDbCalls(r.dbCalls);
  return (
    <li className="code-item" data-testid="code-route">
      <div className="code-item__head">
        <Badge className="code-item__method">{r.method}</Badge>
        <span className="code-item__name font-mono">{r.path}</span>
      </div>
      <Description text={r.doc} />
      {db.length > 0 ? (
        <p className="code-item__db">
          БД: {db.map((g) => `${g.operation} ${g.table}${g.count > 1 ? ` ×${g.count}` : ''}`).join(', ')}
        </p>
      ) : null}
      <p className="code-item__where font-mono">
        {r.handler.name === undefined ? '' : `${r.handler.name} · `}
        {where(r.location)}
      </p>
    </li>
  );
}

function TableItem(props: { readonly table: DbTable }) {
  const t = props.table;
  return (
    <li className="code-item" data-testid="code-table">
      <div className="code-item__head">
        <Badge>{t.orm}</Badge>
        <span className="code-item__name font-mono">{t.name}</span>
      </div>
      <Description text={t.doc ?? t.comments?.[0]} />
      <details className="code-item__details">
        <summary className="code-item__where">Колонки: {t.columns.length}</summary>
        <ul className="code-item__columns font-mono">
          {t.columns.map((c) => (
            <li key={c.name}>
              {c.name}
              {c.sqlName === undefined ? '' : ` (${c.sqlName})`}: {c.type}
            </li>
          ))}
        </ul>
      </details>
      <p className="code-item__where font-mono">{where(t.location)}</p>
    </li>
  );
}

function SymbolItem(props: { readonly symbol: CodeSymbol }) {
  const s = props.symbol;
  return (
    <li className="code-item" data-testid="code-symbol">
      <div className="code-item__head">
        <Badge>{s.kind}</Badge>
        <span className="code-item__name font-mono">{s.name}</span>
      </div>
      {s.signature === undefined ? null : <p className="code-item__where font-mono">{s.signature}</p>}
      <Description text={s.doc ?? s.comments?.[0]} />
      <p className="code-item__where font-mono">{where(s.location)}</p>
    </li>
  );
}

/** Секция со счётчиком и пределом показа. */
function Section<T>(props: {
  readonly title: string;
  readonly items: readonly T[];
  readonly render: (item: T) => ReactElement;
}) {
  if (props.items.length === 0) {
    return null;
  }
  const shown = props.items.slice(0, LIST_LIMIT);
  return (
    <section className="code-section">
      <h3 className="code-section__title">
        {props.title} · {props.items.length}
      </h3>
      <ul className="code-section__list">{shown.map(props.render)}</ul>
      {props.items.length > shown.length ? (
        <p className="drawer__hint">
          Показаны первые {shown.length} из {props.items.length} — уточните фильтр.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Панель кода ноды: сервис (роуты, таблицы, функции) или экран (функции файла).
 */
export function CodePanel(props: { readonly view: ServiceCodeView | PageCodeView }) {
  const [query, setQuery] = useState('');
  const v = props.view;
  const routes = v.kind === 'service' ? v.routes.filter((r) => matchesCodeFilter(query, [r.method, r.path, r.doc])) : [];
  const tables = v.kind === 'service' ? v.tables.filter((t) => matchesCodeFilter(query, [t.name, t.exportName, t.doc])) : [];
  const symbols = v.symbols.filter((s) => matchesCodeFilter(query, [s.name, s.doc, ...(s.comments ?? [])]));
  return (
    <div className="code-panel" data-testid="code-panel">
      {v.kind === 'page' ? <p className="drawer__hint font-mono">{v.file}</p> : null}
      <Field label="Фильтр кода" htmlFor="code-filter">
        <Input
          id="code-filter"
          value={query}
          placeholder="путь, имя, слово из комментария"
          onChange={(e) => setQuery(e.target.value)}
        />
      </Field>
      <Section title="Роуты" items={routes} render={(r) => <RouteItem key={r.id} route={r} />} />
      <Section title="Таблицы" items={tables} render={(t) => <TableItem key={t.id} table={t} />} />
      <Section title="Функции и компоненты" items={symbols} render={(s) => <SymbolItem key={s.id} symbol={s} />} />
    </div>
  );
}
