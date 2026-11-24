/**
 * Какие варианты галереи открыты на сервере трансляции: видимые узлы, не больше предела.
 */
import type { StreamScreen } from '../stream/stream-protocol';
import type { Gallery } from './gallery';

/** Окно страницы компонента, px. */
export const COMPONENT_VIEWPORT = { width: 420, height: 320 };

/** Сколько вариантов транслируется одновременно (как живые экраны карты). */
export const MAX_LIVE_COMPONENTS = 12;

/**
 * Id смонтированных вариантов: видимые, в порядке галереи, до предела.
 *
 * @param gallery - галерея
 * @param visible - id видимых узлов
 */
export function mountedComponentIds(gallery: Gallery, visible: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const g of gallery.groups) {
    for (const item of g.items) {
      if (visible.has(item.id) && out.length < MAX_LIVE_COMPONENTS) {
        out.push(item.id);
      }
    }
  }
  return out;
}

/**
 * Экраны трансляции галереи.
 *
 * @param gallery - галерея
 * @param visible - id видимых узлов
 */
export function componentStreamScreens(gallery: Gallery, visible: ReadonlySet<string>): StreamScreen[] {
  const mounted = new Set(mountedComponentIds(gallery, visible));
  return gallery.groups.flatMap((g) =>
    g.items.filter((i) => mounted.has(i.id)).map((i) => ({ key: i.id, url: i.url, width: COMPONENT_VIEWPORT.width, height: COMPONENT_VIEWPORT.height, live: true })),
  );
}
