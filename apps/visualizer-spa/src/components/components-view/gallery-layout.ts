/**
 * Раскладка галереи на холсте, как Storybook: группа (приложение · папка) — заголовок,
 * под ним строка на компонент, варианты компонента — слева направо.
 */
import type { Gallery, GalleryItem } from '../../lib/components-gallery/gallery';

/** Позиция узла. */
export type GalleryNodePlace =
  | { readonly kind: 'title'; readonly id: string; readonly x: number; readonly y: number; readonly title: string; readonly width: number }
  | { readonly kind: 'item'; readonly id: string; readonly x: number; readonly y: number; readonly item: GalleryItem };

/** Зазоры раскладки, px мира. */
export const GALLERY_GAP = { column: 32, row: 32, title: 40, group: 96 };

/**
 * Узлы галереи: заголовок группы, под ним строки компонентов.
 *
 * @param gallery - галерея
 * @param size - внешний размер узла варианта
 */
export function galleryLayout(gallery: Gallery, size: { readonly width: number; readonly height: number }): GalleryNodePlace[] {
  const out: GalleryNodePlace[] = [];
  let y = 0;
  for (const g of gallery.groups) {
    const rows = new Map<string, GalleryItem[]>();
    for (const item of g.items) {
      rows.set(item.key, [...(rows.get(item.key) ?? []), item]);
    }
    const widest = Math.max(...[...rows.values()].map((r) => r.length));
    out.push({ kind: 'title', id: 'title:' + g.appId + '/' + g.folder, x: 0, y, title: g.folder === '.' ? g.appLabel : g.appLabel + ' · ' + g.folder, width: widest * (size.width + GALLERY_GAP.column) - GALLERY_GAP.column });
    y += GALLERY_GAP.title;
    for (const row of rows.values()) {
      row.forEach((item, i) => out.push({ kind: 'item', id: item.id, x: i * (size.width + GALLERY_GAP.column), y, item }));
      y += size.height + GALLERY_GAP.row;
    }
    y += GALLERY_GAP.group - GALLERY_GAP.row;
  }
  return out;
}
