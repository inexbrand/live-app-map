import { describe, expect, test } from 'bun:test';
import type { DbLiveColumn } from './contract';
import {
  addNewRow,
  buildChanges,
  editCell,
  editCount,
  editNewRow,
  emptyEdits,
  isNewRowId,
  markDeleted,
  restoreRow,
  rowIdOf,
  undoCell,
} from './edits';

const pk = ['id'];
const row1 = { id: '1', name: 'Анна', note: null };
const row2 = { id: '2', name: 'Борис', note: 'x' };
const columns: DbLiveColumn[] = [
  { name: 'id', type: 'int4', nullable: false, hasDefault: true },
  { name: 'name', type: 'text', nullable: false, hasDefault: false },
  { name: 'note', type: 'text', nullable: true, hasDefault: false },
];

describe('накопленные правки сетки', () => {
  test('правка ячейки попадает в updates с ключом PK; возврат исходного значения снимает правку', () => {
    let e = editCell(emptyEdits(), row1, pk, 'name', 'Аня');
    expect(editCount(e)).toBe(1);
    const built = buildChanges('users', e, columns);
    expect(built).toEqual({ ok: true, changes: { table: 'users', inserts: [], updates: [{ key: { id: '1' }, set: { name: 'Аня' } }], deletes: [] } });
    e = editCell(e, row1, pk, 'note', 'заметка');
    expect(editCount(e)).toBe(2);
    e = editCell(e, row1, pk, 'name', 'Анна');
    e = editCell(e, row1, pk, 'note', null);
    expect(e.updates.size).toBe(0);
    expect(editCount(e)).toBe(0);
  });

  test('отмена одной ячейки оставляет остальные', () => {
    let e = editCell(emptyEdits(), row1, pk, 'name', 'Аня');
    e = editCell(e, row1, pk, 'note', 'n');
    e = undoCell(e, rowIdOf(row1, pk), 'name');
    expect(e.updates.get(rowIdOf(row1, pk))?.set).toEqual({ note: 'n' });
    e = undoCell(e, rowIdOf(row1, pk), 'note');
    expect(e.updates.size).toBe(0);
  });

  test('новая строка: пустое обязательное поле блокирует пакет, заполненное — уходит только заданными колонками', () => {
    const added = addNewRow(emptyEdits());
    expect(isNewRowId(added.id)).toBe(true);
    let e = added.edits;
    expect(buildChanges('users', e, columns)).toEqual({ ok: false, missing: [{ id: added.id, column: 'name' }] });
    e = editNewRow(e, added.id, 'name', 'Вера');
    expect(buildChanges('users', e, columns)).toEqual({ ok: true, changes: { table: 'users', inserts: [{ name: 'Вера' }], updates: [], deletes: [] } });
    e = editNewRow(e, added.id, 'name', '');
    expect(buildChanges('users', e, columns).ok).toBe(false);
    e = editNewRow(e, added.id, 'name', 'Вера');
    e = undoCell(e, added.id, 'name');
    expect(e.inserts[0]?.values).toEqual({});
  });

  test('новые строки — свежая первой в сетке, в пакете — в порядке добавления', () => {
    const a = addNewRow(emptyEdits());
    const b = addNewRow(editNewRow(a.edits, a.id, 'name', 'первая'));
    const e = editNewRow(b.edits, b.id, 'name', 'вторая');
    expect(e.inserts.map((r) => r.id)).toEqual([b.id, a.id]);
    const built = buildChanges('users', e, columns);
    expect(built.ok && built.changes.inserts).toEqual([{ name: 'первая' }, { name: 'вторая' }]);
  });

  test('удаление: существующие строки — ключом, новые — убираются; правка удаляемой строки не уходит', () => {
    const a = addNewRow(emptyEdits());
    let e = editCell(a.edits, row2, pk, 'name', 'Б');
    e = markDeleted(e, [{ id: rowIdOf(row1, pk), row: row1 }, { id: rowIdOf(row2, pk), row: row2 }, { id: a.id, row: null }], pk);
    expect(e.inserts).toHaveLength(0);
    expect(editCount(e)).toBe(2);
    expect(buildChanges('users', e, columns)).toEqual({ ok: true, changes: { table: 'users', inserts: [], updates: [], deletes: [{ id: '1' }, { id: '2' }] } });
    e = restoreRow(e, rowIdOf(row2, pk));
    expect(buildChanges('users', e, columns)).toEqual({ ok: true, changes: { table: 'users', inserts: [], updates: [{ key: { id: '2' }, set: { name: 'Б' } }], deletes: [{ id: '1' }] } });
  });

  test('составной PK и таблица без PK', () => {
    const r = { a: '1', b: null, v: 'x' };
    expect(rowIdOf(r, ['a', 'b'])).toBe('["1",null]');
    expect(() => rowIdOf(r, [])).toThrow('нет первичного ключа');
    expect(() => rowIdOf(r, ['zzz'])).toThrow('zzz');
  });
});
