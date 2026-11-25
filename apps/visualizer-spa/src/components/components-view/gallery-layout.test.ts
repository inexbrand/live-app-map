import { expect, test } from 'bun:test';
import { buildGallery } from '../../lib/components-gallery/gallery';
import { galleryLayout, GALLERY_GAP } from './gallery-layout';

const app = [{ id: 'm', label: 'Мини', dir: 'apps/m', baseUrl: 'http://h' }];

test('группа — заголовок, строка на компонент, варианты слева направо', () => {
  const g = buildGallery(
    { 'apps/m/src/ui/A.tsx#A': [{ id: 'a1', label: 'А1' }, { id: 'a2', label: 'А2' }], 'apps/m/src/ui/C.tsx#C': [{ id: 'c', label: 'В' }], 'apps/m/src/feed/B.tsx#B': [{ id: 'b', label: 'Б' }] },
    app,
  );
  const W = 100;
  const H = 50;
  const places = galleryLayout(g, { width: W, height: H });
  const feedEnd = GALLERY_GAP.title + H + GALLERY_GAP.group;
  expect(places.map((p) => [p.kind, p.kind === 'title' ? p.title : p.id, p.x, p.y])).toEqual([
    ['title', 'Мини · src/feed', 0, 0],
    ['item', 'component:apps/m/src/feed/B.tsx#B/b', 0, GALLERY_GAP.title],
    ['title', 'Мини · src/ui', 0, feedEnd],
    ['item', 'component:apps/m/src/ui/A.tsx#A/a1', 0, feedEnd + GALLERY_GAP.title],
    ['item', 'component:apps/m/src/ui/A.tsx#A/a2', W + GALLERY_GAP.column, feedEnd + GALLERY_GAP.title],
    ['item', 'component:apps/m/src/ui/C.tsx#C/c', 0, feedEnd + GALLERY_GAP.title + H + GALLERY_GAP.row],
  ]);
});

test('компонент в корне приложения — заголовок без папки', () => {
  const g = buildGallery({ 'apps/m/A.tsx#A': [{ id: 'a', label: 'А' }] }, app);
  const t = galleryLayout(g, { width: 100, height: 50 })[0];
  expect(t?.kind === 'title' ? t.title : '').toBe('Мини');
});
