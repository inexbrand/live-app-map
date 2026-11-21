import { Elysia } from 'elysia';

/** Опции фабрики каталога. */
export type CatalogOptions = { readonly name: string; readonly basePath: string };

/** Фабрика CRUD-плагина: путь приходит из опций. */
export function createCatalogPlugin(options: CatalogOptions) {
  const { basePath } = options;
  return new Elysia({ name: options.name })
    .get(basePath, () => [])
    .patch(`${basePath}/:id`, () => ({ ok: true }));
}

/** Каталог тегов. */
export const tagsPlugin = createCatalogPlugin({ name: 'tags', basePath: '/api/admin/tags' });

/** Каталог цветов. */
export const colorsPlugin = createCatalogPlugin({ name: 'colors', basePath: '/api/admin/colors' });
