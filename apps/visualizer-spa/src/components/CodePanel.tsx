/**
 * Код ноды в правой панели: роуты сервиса с описанием, запросами в БД и экранами-вызывающими,
 * таблицы, функции и компоненты с комментариями; у экрана — вызовы API и переход к роуту.
 */
import { useEffect, useRef, useState } from 'react';
import type { ApiRoute, CodeSymbol, DbTable } from '@live-app-map/schema';
import { Badge, Field, Input } from '../ui';
import { groupDbCalls, type PageCodeView, type RouteCaller, type ScreenApiItem as Item, type ServiceCodeView } from '../lib/node-code';
import { matchesCodeFilter } from '../lib/code-filter';
import { useAppStore } from '../store/app-store';
import { DbLine, Description, Section, where } from './code-parts';
import { ScreenApiItem } from './ScreenApiItem';

function RouteItem(props: { readonly route: ApiRoute; readonly callers: readonly RouteCaller[]; readonly focused: boolean }) {
  const r = props.route;
  const selectPage = useAppStore((s) => s.selectPage);
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (props.focused) {
      ref.current?.scrollIntoView({ block: 'center' });
    }
  }, [props.focused]);
  return (
    <li
      ref={ref}
      className={props.focused ? 'code-item code-item--focus' : 'code-item'}
      data-testid={props.focused ? 'code-route-focused' : 'code-route'}
    >
      <div className="code-item__head">
        <Badge className="code-item__method">{r.method}</Badge>
        <span className="code-item__name font-mono">{r.path}</span>
      </div>
      <Description text={r.doc} />
      <DbLine groups={groupDbCalls(r.dbCalls)} />
      {props.callers.length === 0 ? null : (
        <p className="code-item__db">
          Экраны:{' '}
          {props.callers.map((c, i) => (
            <span key={c.nodeId}>
              {i > 0 ? ', ' : ''}
              <button type="button" className="code-item__link" onClick={() => selectPage(c.nodeId)}>
                {c.title}
              </button>
            </span>
          ))}
        </p>
      )}
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

/** Роуты сервиса по фильтру; роут, к которому перешли, — первым. */
function serviceRoutes(v: ServiceCodeView, query: string, focusId: string | null): ApiRoute[] {
  const routes = v.routes.filter((r) => r.id === focusId || matchesCodeFilter(query, [r.method, r.path, r.doc]));
  const focused = routes.find((r) => r.id === focusId);
  return focused === undefined ? routes : [focused, ...routes.filter((r) => r !== focused)];
}

/** Вызов экрана подходит под фильтр. */
function itemMatches(query: string, i: Item): boolean {
  return matchesCodeFilter(query, [i.call.method, i.call.path, i.route?.path, i.route?.doc, i.service?.name, i.via]);
}

/**
 * Панель кода ноды: сервис (роуты, таблицы, функции) или экран (вызовы API, функции файла).
 */
export function CodePanel(props: { readonly view: ServiceCodeView | PageCodeView }) {
  const [query, setQuery] = useState('');
  const focusId = useAppStore((s) => s.codeFocusRouteId);
  const v = props.view;
  const routes = v.kind === 'service' ? serviceRoutes(v, query, focusId) : [];
  const tables = v.kind === 'service' ? v.tables.filter((t) => matchesCodeFilter(query, [t.name, t.exportName, t.doc])) : [];
  const symbols = v.symbols.filter((s) => matchesCodeFilter(query, [s.name, s.doc, ...(s.comments ?? [])]));
  const api = v.kind === 'page' ? v.api.filter((i) => itemMatches(query, i)) : [];
  const unmatched = v.kind === 'page' ? v.unmatched.filter((i) => itemMatches(query, i)) : [];
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
      <Section title="Вызовы API" testId="screen-api" items={api} render={(i) => <ScreenApiItem key={i.call.id} item={i} />} />
      <Section
        title="Не сопоставлены"
        testId="screen-api-unmatched"
        items={unmatched}
        render={(i) => <ScreenApiItem key={i.call.id} item={i} />}
      />
      <Section
        title="Роуты"
        items={routes}
        render={(r) => (
          <RouteItem
            key={r.id}
            route={r}
            focused={r.id === focusId}
            callers={v.kind === 'service' ? (v.callers.get(r.id) ?? []) : []}
          />
        )}
      />
      <Section title="Таблицы" items={tables} render={(t) => <TableItem key={t.id} table={t} />} />
      <Section title="Функции и компоненты" items={symbols} render={(s) => <SymbolItem key={s.id} symbol={s} />} />
    </div>
  );
}
