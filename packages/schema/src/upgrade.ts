/**
 * Подъём старых версий enterprise-документа до текущей.
 */
import type { AppMapDocument, AppMapDocumentV1 } from './types';
import { FORMAT_VERSION } from './types';

/**
 * Поднимает документ formatVersion 1 до текущей версии (2).
 * v1 отличается только отсутствием раздела `code`, поэтому меняется лишь номер версии.
 * Документ текущей версии возвращается как есть.
 *
 * @param doc - документ v1 или v2 после проверки Zod
 * @returns документ текущей версии
 */
export function upgradeAppMapDocument(
  doc: AppMapDocument | AppMapDocumentV1,
): AppMapDocument {
  if (doc.formatVersion === FORMAT_VERSION) {
    return doc;
  }
  return { ...doc, formatVersion: FORMAT_VERSION };
}
