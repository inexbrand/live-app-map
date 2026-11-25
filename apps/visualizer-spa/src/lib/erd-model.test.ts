import { describe, expect, test } from 'bun:test';
import type { DbColumn, DbTable } from '@live-app-map/schema';
import { ERD_HEADER_HEIGHT, ERD_ROW_HEIGHT, erdGraph } from './erd-model';

function table(exportName: string, columns: readonly DbColumn[]): DbTable {
  return { id: `t:${exportName}`, orm: 'drizzle', name: exportName.toLowerCase(), exportName, serviceId: 's', location: { file: 'db.ts', line: 1 }, columns };
}

const users = table('users', [{ name: 'id', type: 'uuid', primaryKey: true }, { name: 'email', type: 'text' }]);
const posts = table('posts', [
  { name: 'id', type: 'uuid', primaryKey: true },
  { name: 'authorId', sqlName: 'author_id', type: 'uuid', references: { table: 'users', column: 'id', onDelete: 'cascade' } },
  { name: 'ghostId', type: 'uuid', references: { table: 'ghosts', column: 'id' } },
  { name: 'parentId', type: 'uuid', references: { table: 'posts', column: 'id' } },
]);

describe('erdGraph', () => {
  const g = erdGraph([users, posts]);

  test('карточка на каждую таблицу, высота по числу колонок', () => {
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['posts', 'users']);
    const p = g.nodes.find((n) => n.id === 'posts');
    expect(p?.height).toBe(ERD_HEADER_HEIGHT + 4 * ERD_ROW_HEIGHT);
  });

  test('связь от колонки FK к колонке цели, ссылка на неизвестную таблицу отброшена, ссылка на себя есть', () => {
    expect(g.edges.map((e) => [e.source, e.sourceHandle, e.target, e.targetHandle])).toEqual([
      ['posts', 'authorId:out', 'users', 'id:in'],
      ['posts', 'parentId:out', 'posts', 'id:in'],
    ]);
    expect(g.edges[0]?.label).toBe('cascade');
  });

  test('раскладка: карточки не пересекаются', () => {
    const [a, b] = g.nodes;
    if (a === undefined || b === undefined) {
      throw new Error('нет нод');
    }
    const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
    expect(apart).toBe(true);
  });

  test('таблица со многими зависимыми — схема шире, чем выше (панель схемы горизонтальная)', () => {
    const deps = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => table(n, [{ name: 'id', type: 'int' }, { name: 'userId', type: 'uuid', references: { table: 'users', column: 'id' } }]));
    const g2 = erdGraph([users, ...deps]);
    const right = Math.max(...g2.nodes.map((n) => n.x + n.width)) - Math.min(...g2.nodes.map((n) => n.x));
    const bottom = Math.max(...g2.nodes.map((n) => n.y + n.height)) - Math.min(...g2.nodes.map((n) => n.y));
    expect(right).toBeGreaterThan(bottom);
  });

  test('таблицы без связей — под связанными, рядами', () => {
    const lonely = ['l1', 'l2', 'l3'].map((n) => table(n, [{ name: 'id', type: 'int' }]));
    const g2 = erdGraph([users, posts, ...lonely]);
    const linkedBottom = Math.max(...g2.nodes.filter((n) => n.id === 'users' || n.id === 'posts').map((n) => n.y + n.height));
    const alone = g2.nodes.filter((n) => n.id.startsWith('l'));
    expect(alone.every((n) => n.y > linkedBottom)).toBe(true);
    expect(new Set(alone.map((n) => n.y)).size).toBe(1);
  });

  test('таблица без связей тоже на схеме', () => {
    const lonely = table('logs', [{ name: 'id', type: 'int' }]);
    const g2 = erdGraph([users, posts, lonely]);
    expect(g2.nodes.find((n) => n.id === 'logs')?.height).toBe(ERD_HEADER_HEIGHT + ERD_ROW_HEIGHT);
  });
});
