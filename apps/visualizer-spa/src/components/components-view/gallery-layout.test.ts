import { expect, test } from 'bun:test';
import { buildGallery } from '../../lib/components-gallery/gallery';
import { galleryLayout, GALLERY_GAP } from './gallery-layout';

test('колонка на группу, заголовок сверху, варианты друг под другом', () => {
  const g = buildGallery(
    { 'apps/m/src/ui/A.tsx#A': [{ id: 'a1', label: 'А1' }, { id: 'a2', label: 'А2' }], 'apps/m/src/feed/B.tsx#B': [{ id: 'b', label: 'Б' }] },
    [{ id: 'm', label: 'Мини', dir: 'apps/m', baseUrl: 'http://h' }],
  );
  const places = galleryLayout(g, { width: 100, height: 50 });
  expect(places.map((p) => [p.kind, p.kind === 'title' ? p.title : p.id, p.x, p.y])).toEqual([
    ['title', 'Мини · src/feed', 0, 0],
    ['item', 'component:apps/m/src/feed/B.tsx#B/b', 0, GALLERY_GAP.title],
    ['title', 'Мини · src/ui', 100 + GALLERY_GAP.column, 0],
    ['item', 'component:apps/m/src/ui/A.tsx#A/a1', 100 + GALLERY_GAP.column, GALLERY_GAP.title],
    ['item', 'component:apps/m/src/ui/A.tsx#A/a2', 100 + GALLERY_GAP.column, GALLERY_GAP.title + 50 + GALLERY_GAP.row],
  ]);
});
