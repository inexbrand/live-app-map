/**
 * Сетка данных таблицы БД (нижняя панель вида «База данных»): страницы, сортировка, фильтр,
 * правка ячеек, новые и удаляемые строки; правки копятся до «Сохранить» (одна транзакция).
 */
import { useEffect, useState } from 'react';
import { pageDbDataClient, type DbDataClient } from '@/lib/db-data/client';
import type { DbStatus } from '@/lib/db-data/contract';
import { confirmDiscard, messageOf, TableGrid } from './DataGridBody';
import './data-grid.css';

export { confirmDiscard };

/** Props сетки данных. */
export type DataGridProps = {
  /** Имя таблицы в БД. */
  readonly table: string;
  /** Клиент эндпоинтов; по умолчанию — dev-сервер этой страницы. */
  readonly client?: DbDataClient;
  /** Сколько несохранённых правок: родитель спрашивает подтверждение перед сменой таблицы. */
  readonly onDirtyChange?: (count: number) => void;
};

type StatusLoad = { readonly kind: 'loading' } | { readonly kind: 'failed'; readonly message: string } | { readonly kind: 'done'; readonly status: DbStatus };

/** Сетка данных таблицы: сначала состояние подключения, затем строки. */
export function DataGrid(props: DataGridProps) {
  const client = props.client ?? pageDbDataClient;
  const [load, setLoad] = useState<StatusLoad>({ kind: 'loading' });
  useEffect(() => {
    let live = true;
    client.status().then(
      (status) => live && setLoad({ kind: 'done', status }),
      (e: unknown) => live && setLoad({ kind: 'failed', message: messageOf(e) }),
    );
    return () => {
      live = false;
    };
  }, [client]);
  if (load.kind === 'loading') {
    return <div className="dg dg--notice" data-testid="data-grid">Подключение к БД…</div>;
  }
  if (load.kind === 'failed') {
    return <div className="dg dg--notice dg-error" data-testid="data-grid" role="alert">{load.message}</div>;
  }
  const status = load.status;
  if (status.state === 'off') {
    return (
      <div className="dg dg--notice" data-testid="data-grid">
        <p>{status.reason}</p>
        <pre className="dg-hint">{status.hint}</pre>
      </div>
    );
  }
  if (status.state === 'error') {
    return <div className="dg dg--notice dg-error" data-testid="data-grid" role="alert">Не удалось подключиться к БД: {status.message}</div>;
  }
  const readOnly = status.writable ? null : (status.readOnlyReason ?? 'сервер запретил запись в эту БД');
  return <TableGrid key={props.table} table={props.table} client={client} readOnly={readOnly} onDirtyChange={props.onDirtyChange} />;
}

