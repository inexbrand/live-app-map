/**
 * Ячейка сетки данных и её редактор по типу колонки (двойной клик — правка).
 */
import { memo, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { OptionSelect } from '@/components/option-select';
import { cn } from '@/lib/utils';
import type { DbCell, DbLiveColumn } from '@/lib/db-data/contract';
import type { RowId } from '@/lib/db-data/edits';

const NUMERIC_TYPES = new Set(['int2', 'int4', 'int8', 'float4', 'float8', 'numeric', 'money', 'oid']);
const INTEGER_TYPES = new Set(['int2', 'int4', 'int8', 'oid']);
const NUMBER_RE = /^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
/** Значение пункта NULL в списках (в Postgres-тексте такого не бывает). */
const NULL_OPTION = '\u0000null';

type EditorKind = 'bool' | 'enum' | 'json' | 'number' | 'text';

/** Какой редактор у колонки. */
export function editorKindOf(column: DbLiveColumn): EditorKind {
  if (column.type === 'bool') {
    return 'bool';
  }
  if (column.enumValues !== undefined) {
    return 'enum';
  }
  if (column.type === 'json' || column.type === 'jsonb') {
    return 'json';
  }
  return NUMERIC_TYPES.has(column.type) ? 'number' : 'text';
}

/** Ошибка ввода или null, если текст подходит колонке. */
export function draftError(kind: EditorKind, draft: string): string | null {
  if (kind === 'json') {
    try {
      JSON.parse(draft);
      return null;
    } catch (e) {
      return `неверный JSON: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  if (kind === 'number' && draft !== '' && !NUMBER_RE.test(draft.trim())) {
    return 'введите число';
  }
  return null;
}

/** Обработчики ячейки; стабильные ссылки, чтобы memo ячеек работал. */
export type CellHandlers = {
  readonly onStartEdit: (id: RowId, column: string) => void;
  readonly onCommit: (id: RowId, column: string, value: DbCell) => void;
  readonly onUndo: (id: RowId, column: string) => void;
  readonly onCancel: () => void;
};

type EditorProps = {
  readonly column: DbLiveColumn;
  readonly value: DbCell;
  readonly changed: boolean;
  readonly onCommit: (value: DbCell) => void;
  readonly onUndo: () => void;
  readonly onCancel: () => void;
};

function choiceItems(column: DbLiveColumn, kind: EditorKind): { value: string; label: string }[] {
  const values = kind === 'bool' ? ['true', 'false'] : (column.enumValues ?? []);
  const items = values.map((v) => ({ value: v, label: v }));
  return column.nullable ? [...items, { value: NULL_OPTION, label: 'NULL' }] : items;
}

function CellEditor(props: EditorProps) {
  const { column, value, onCommit, onCancel } = props;
  const kind = editorKindOf(column);
  const [draft, setDraft] = useState(value ?? '');
  const [error, setError] = useState<string | null>(null);
  const commit = (): void => {
    const why = draftError(kind, draft);
    setError(why);
    if (why === null) {
      onCommit(kind === 'number' ? draft.trim() : draft);
    }
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter' && !e.shiftKey && kind !== 'bool' && kind !== 'enum') {
      e.preventDefault();
      commit();
    }
  };
  const label = `Значение ${column.name}`;
  let field;
  if (kind === 'bool' || kind === 'enum') {
    field = (
      <OptionSelect
        aria-label={label}
        size="sm"
        items={choiceItems(column, kind)}
        value={value === null ? (column.nullable ? NULL_OPTION : '') : value}
        placeholder="выберите"
        onValueChange={(v) => onCommit(v === NULL_OPTION ? null : v)}
      />
    );
  } else if (kind === 'json') {
    field = <Textarea aria-label={label} autoFocus className="dg-editor__json" value={draft} aria-invalid={error !== null} onChange={(e) => setDraft(e.target.value)} />;
  } else {
    field = (
      <Input
        aria-label={label}
        autoFocus
        inputMode={kind === 'number' ? (INTEGER_TYPES.has(column.type) ? 'numeric' : 'decimal') : undefined}
        value={draft}
        aria-invalid={error !== null}
        onChange={(e) => setDraft(e.target.value)}
      />
    );
  }
  // mousedown не отбирает фокус у поля: кнопки работают до blur.
  const keep = (e: { preventDefault(): void }): void => e.preventDefault();
  return (
    <div className="dg-editor" role="dialog" aria-label={`Правка ${column.name}`} onKeyDown={onKeyDown}>
      {field}
      {error === null ? null : <p className="dg-editor__error">{error}</p>}
      <div className="dg-editor__actions">
        {kind === 'bool' || kind === 'enum' ? null : (
          <Button size="xs" onMouseDown={keep} onClick={commit}>
            Применить
          </Button>
        )}
        {column.nullable ? (
          <Button size="xs" variant="outline" onMouseDown={keep} onClick={() => onCommit(null)}>
            NULL
          </Button>
        ) : null}
        {props.changed ? (
          <Button size="xs" variant="outline" onMouseDown={keep} onClick={props.onUndo}>
            Вернуть
          </Button>
        ) : null}
        <Button size="xs" variant="ghost" onMouseDown={keep} onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </div>
  );
}

/** Props ячейки. */
export type DataGridCellProps = {
  readonly id: RowId;
  readonly column: DbLiveColumn;
  readonly value: DbCell;
  readonly changed: boolean;
  readonly editing: boolean;
  readonly editable: boolean;
  /** Пустая обязательная ячейка новой строки. */
  readonly required: boolean;
  /** Подпись пустой ячейки: NULL, DEFAULT у новой строки, «обязательно». */
  readonly emptyLabel: string;
  readonly error: string | undefined;
  readonly handlers: CellHandlers;
};

/** Ячейка: значение (NULL приглушённо, длинный текст обрезан) или редактор. */
export const DataGridCell = memo(function DataGridCell(props: DataGridCellProps) {
  const { id, column, value, handlers } = props;
  const name = column.name;
  return (
    <td
      className={cn('dg-cell', props.changed && 'dg-cell--changed', props.error !== undefined && 'dg-cell--invalid')}
      data-column={name}
      onDoubleClick={props.editable && !props.editing ? () => handlers.onStartEdit(id, name) : undefined}
    >
      {value === null ? (
        <span className={cn('dg-null', props.required && 'dg-null--required')}>{props.emptyLabel}</span>
      ) : (
        <span className="dg-value" title={value}>
          {value}
        </span>
      )}
      {props.error === undefined ? null : <p className="dg-cell__error">{props.error}</p>}
      {props.editing ? (
        <CellEditor
          column={column}
          value={value}
          changed={props.changed}
          onCommit={(v) => handlers.onCommit(id, name, v)}
          onUndo={() => handlers.onUndo(id, name)}
          onCancel={handlers.onCancel}
        />
      ) : null}
    </td>
  );
});
