/**
 * Модель вида «База данных» на настоящей карте korbor-all.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { tableDetail } from '@live-app-map/graph';
import { liveAppMapToAppMap, parseLiveAppMapDocument } from '@live-app-map/schema';
import { dbIndexOf, tableRows, tableView } from './db-view-model';

const raw: unknown = JSON.parse(readFileSync(path.join(import.meta.dir, '../../public/maps/korbor-all.liveappmap.json'), 'utf8'));
const parsed = parseLiveAppMapDocument(raw);
if (!parsed.ok) {
  throw new Error('карта korbor-all не разобралась');
}
const doc = liveAppMapToAppMap(parsed.document);
const index = dbIndexOf(doc);

describe('db-view-model на korbor-all', () => {
  test('все таблицы схемы в списке, по имени', () => {
    expect(index).not.toBeNull();
    if (index === null) return;
    const rows = tableRows(index, '');
    expect(rows.length).toBe(doc.code?.tables.length ?? -1);
    expect(rows.map((r) => r.name)).toEqual([...rows.map((r) => r.name)].sort((a, b) => a.localeCompare(b)));
  });

  test('поиск по колонке находит таблицу с этой колонкой', () => {
    if (index === null) return;
    const withFk = doc.code?.tables.find((t) => t.columns.some((c) => c.references !== undefined));
    const col = withFk?.columns.find((c) => c.references !== undefined);
    expect(col).toBeDefined();
    const rows = tableRows(index, col?.sqlName ?? col?.name ?? '');
    expect(rows.some((r) => r.exportName === withFk?.exportName)).toBe(true);
  });

  test('детали таблицы совпадают с tableDetail, у роутов — экраны-вызыватели', () => {
    if (index === null) return;
    const busiest = [...tableRows(index, '')].sort((a, b) => b.reads - a.reads)[0];
    expect(busiest).toBeDefined();
    const v = tableView(index, busiest?.exportName ?? '');
    const d = tableDetail(index, busiest?.exportName ?? '');
    expect(v?.readRoutes.map((u) => u.route.id)).toEqual(d?.readBy.map((r) => r.id));
    expect(v?.readRoutes.length).toBe(busiest?.reads);
    const withScreens = v?.readRoutes.find((u) => u.screens.length > 0);
    if (withScreens !== undefined) {
      expect(index.callersByRoute.get(withScreens.route.id)).toEqual(withScreens.screens);
    }
  });

  test('карта без таблиц — вида нет', () => {
    expect(dbIndexOf({ ...doc, code: undefined })).toBeNull();
    expect(dbIndexOf(null)).toBeNull();
  });
});