/**
 * Раскладка галереи на холсте: колонка на группу (приложение · папка), варианты — сверху вниз.
 */
import type { Gallery, GalleryItem } from '../../lib/components-gallery/gallery';

/** Позиция узла. */
export type GalleryNodePlace =
  | { readonly kind: 'title'; readonly id: string; readonly x: number; readonly y: number; readonly title: string; readonly width: number }
  | { readonly kind: 'item'; readonly id: string; readonly x: number; readonly y: number; readonly item: GalleryItem };

/** Зазоры раскладки, px мира. */
export const GALLERY_GAP = { column: 48, row: 24, title: 40 };

/**
 * Узлы галереи: заголовок колонки «Приложение · папка» и варианты под ним.
 *
 * @param gallery - галерея
 * @param size - внешний размер узла варианта
 */
export function galleryLayout(gallery: Gallery, size: { readonly width: number; readonly height: number }): GalleryNodePlace[] {
  const out: GalleryNodePlace[] = [];
  gallery.groups.forEach((g, gi) => {
    const x = gi * (size.width + GALLERY_GAP.column);
    out.push({ kind: 'title', id: 'title:' + g.appId + '/' + g.folder, x, y: 0, title: g.folder === '.' ? g.appLabel : g.appLabel + ' · ' + g.folder, width: size.width });
    g.items.forEach((item, i) => {
      out.push({ kind: 'item', id: item.id, x, y: GALLERY_GAP.title + i * (size.height + GALLERY_GAP.row), item });
    });
  });
  return out;
}
