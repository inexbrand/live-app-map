/**
 * URL картинки документации для браузера (эндпоинт — docs-asset-middleware на dev-сервере).
 */

/** Путь эндпоинта. */
export const DOCS_ASSET_PATH = '/__lam_docs/asset';

/**
 * URL картинки документации для `<img src>`.
 *
 * @param root - каталог проекта (docs.root карты)
 * @param file - путь от корня
 * @returns относительный URL эндпоинта
 */
export function docsAssetUrl(root: string, file: string): string {
  return `${DOCS_ASSET_PATH}?root=${encodeURIComponent(root)}&path=${encodeURIComponent(file)}`;
}
