/**
 * Запись карты в файл: enterprise (как есть, отсортировано) или viewer liveappmap.
 */
import { writeFileSync } from 'node:fs';
import { sortDocument } from '@live-app-map/graph';
import { appMapToLiveAppMap, type AppMapDocument } from '@live-app-map/schema';

/** Формат файла карты. */
export type MapFileFormat = 'enterprise' | 'liveappmap';

/**
 * Пишет документ в файл JSON.
 *
 * @param doc - документ карты
 * @param out - путь файла
 * @param format - enterprise (по умолчанию) или liveappmap
 */
export function writeMapFile(doc: AppMapDocument, out: string, format: MapFileFormat = 'enterprise'): void {
  const sorted = sortDocument(doc);
  const payload = format === 'liveappmap' ? appMapToLiveAppMap(sorted) : sorted;
  writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
