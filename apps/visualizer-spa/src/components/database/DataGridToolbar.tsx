/**
 * Панель сетки данных: имя таблицы, фильтр «колонка = значение», правки и сохранение; снизу — страницы.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { OptionSelect } from '@/components/option-select';
import type { DbLiveColumn } from '@/lib/db-data/contract';

/**
 * «1 строка», «2 строки», «5 строк».
 *
 * @param n - число строк
 */
export function rowsLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${n} строка`;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} строки`;
  }
  return `${n} строк`;
}

/** Применённый фильтр. */
export type GridFilter = {
  readonly column: string;
  readonly value: string;
};

/** Props панели. */
export type DataGridToolbarProps = {
  readonly table: string;
  readonly total: number | null;
  readonly columns: readonly DbLiveColumn[];
  readonly filter: GridFilter | null;
  readonly editable: boolean;
  readonly selectedCount: number;
  readonly editCount: number;
  readonly busy: boolean;
  readonly onFilter: (filter: GridFilter | null) => void;
  readonly onAdd: () => void;
  readonly onDeleteSelected: () => void;
  readonly onReset: () => void;
  readonly onSave: () => void;
  readonly onRefresh: () => void;
};

/** Верхняя панель сетки. */
export function DataGridToolbar(props: DataGridToolbarProps) {
  const [column, setColumn] = useState(props.filter?.column ?? '');
  const [value, setValue] = useState(props.filter?.value ?? '');
  const [hint, setHint] = useState<string | null>(null);
  const apply = (): void => {
    if (column === '') {
      setHint('выберите колонку фильтра');
      return;
    }
    setHint(null);
    props.onFilter({ column, value });
  };
  const clear = (): void => {
    setColumn('');
    setValue('');
    setHint(null);
    props.onFilter(null);
  };
  return (
    <div className="dg-toolbar">
      <div className="dg-toolbar__title">
        <strong>{props.table}</strong>
        <span className="dg-muted">{props.total === null ? '…' : rowsLabel(props.total)}</span>
        {props.busy ? <Spinner /> : null}
      </div>
      <form
        className="dg-toolbar__filter"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <OptionSelect
          aria-label="Колонка фильтра"
          size="sm"
          className="dg-toolbar__column"
          placeholder="колонка"
          items={props.columns.map((c) => ({ value: c.name, label: c.name }))}
          value={column}
          onValueChange={setColumn}
        />
        <span className="dg-muted">=</span>
        <Input aria-label="Значение фильтра" className="h-7 w-40" placeholder="значение" value={value} onChange={(e) => setValue(e.target.value)} />
        <Button type="submit" size="sm" variant="outline">
          Найти
        </Button>
        {props.filter === null ? null : (
          <Button type="button" size="sm" variant="ghost" onClick={clear}>
            Сбросить фильтр
          </Button>
        )}
        {hint === null ? null : <span className="dg-toolbar__hint">{hint}</span>}
      </form>
      <div className="dg-toolbar__actions">
        {props.editable ? (
          <>
            <Button size="sm" variant="outline" onClick={props.onAdd}>
              Добавить строку
            </Button>
            {props.selectedCount > 0 ? (
              <Button size="sm" variant="destructive" onClick={props.onDeleteSelected}>
                Удалить выбранные ({props.selectedCount})
              </Button>
            ) : null}
            {props.editCount > 0 ? (
              <>
                <Button size="sm" variant="ghost" onClick={props.onReset}>
                  Отменить
                </Button>
                <Button size="sm" onClick={props.onSave} disabled={props.busy}>
                  Сохранить изменения ({props.editCount})
                </Button>
              </>
            ) : null}
          </>
        ) : null}
        <Button size="sm" variant="ghost" onClick={props.onRefresh} title="Перечитать страницу из БД">
          Обновить
        </Button>
      </div>
    </div>
  );
}

/** Props пагинации. */
export type DataGridPagerProps = {
  readonly page: number;
  readonly size: number;
  readonly total: number;
  readonly onPage: (page: number) => void;
};

/** Нижняя строка: «строки 1–50 из N», назад/вперёд. */
export function DataGridPager(props: DataGridPagerProps) {
  const { page, size, total } = props;
  const from = page * size + 1;
  const to = Math.min(total, (page + 1) * size);
  return (
    <div className="dg-pager">
      <span className="dg-muted">{total === 0 ? 'строк нет' : `строки ${from}–${to} из ${total}`}</span>
      <Button size="sm" variant="outline" disabled={page === 0} onClick={() => props.onPage(page - 1)}>
        Назад
      </Button>
      <Button size="sm" variant="outline" disabled={to >= total} onClick={() => props.onPage(page + 1)}>
        Вперёд
      </Button>
    </div>
  );
}
