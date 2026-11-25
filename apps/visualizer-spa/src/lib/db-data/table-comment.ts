/**
 * Замечание к объявлению таблицы: привязка к коду и отправка в общий список замечаний.
 */
import type { CommentAnchor } from '@live-app-map/mcp-server/comments-schema';
import type { DbTable } from '@live-app-map/schema';
import type { SourceSnippet } from '../project/source-contract';

/** pageId замечаний к таблице. */
export function tablePageId(exportName: string): string {
  return `db:${exportName}`;
}

/**
 * Привязка замечания к объявлению таблицы.
 *
 * @param table - таблица карты
 * @param snippet - объявление из файла (строки)
 * @param mapName - имя карты (как у замечаний к экранам)
 */
export function tableCommentAnchor(table: DbTable, snippet: SourceSnippet, mapName: string | null): CommentAnchor {
  return {
    mapName,
    pageId: tablePageId(table.exportName),
    pageTitle: table.name,
    pageUrl: null,
    role: null,
    element: null,
    code: { kind: 'table', name: table.exportName, file: snippet.file, line: snippet.startLine, endLine: snippet.endLine },
  };
}
