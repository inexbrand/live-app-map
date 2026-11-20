/**
 * Модели Prisma из `schema.prisma`: имя, `@@map`, поля, `///`-описание.
 */
import type { DbColumn, SourceLocation } from '@live-app-map/schema';
import type { FoundTable } from './tables-drizzle';

/**
 * Разбирает текст schema.prisma.
 *
 * @param text - содержимое файла
 * @param file - путь файла относительно корня
 * @returns модели как таблицы
 */
export function parsePrismaSchema(text: string, file: string): FoundTable[] {
  const out: FoundTable[] = [];
  const lines = text.split(/\r?\n/);
  let docLines: string[] = [];
  let current: { name: string; table: string; location: SourceLocation; doc: string; columns: DbColumn[] } | undefined;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (current === undefined) {
      const model = /^model\s+(\w+)\s*\{/.exec(line);
      if (model?.[1] !== undefined) {
        current = { name: model[1], table: model[1], location: { file, line: index + 1 }, doc: docLines.join('\n'), columns: [] };
        docLines = [];
        return;
      }
      docLines = line.startsWith('///') ? [...docLines, line.replace(/^\/\/\/\s?/, '')] : [];
      return;
    }
    if (line.startsWith('}')) {
      const { name, table, location, doc, columns } = current;
      out.push({ orm: 'prisma', name: table, exportName: name, location, columns, ...(doc === '' ? {} : { doc }) });
      current = undefined;
      return;
    }
    const mapTable = /^@@map\(\s*"([^"]+)"\s*\)/.exec(line);
    if (mapTable?.[1] !== undefined) {
      current.table = mapTable[1];
      return;
    }
    const field = /^(\w+)\s+([\w?[\]]+)(.*)$/.exec(line);
    if (field?.[1] !== undefined && field[2] !== undefined) {
      const sqlName = /@map\(\s*"([^"]+)"\s*\)/.exec(field[3] ?? '')?.[1];
      current.columns.push({ name: field[1], ...(sqlName === undefined ? {} : { sqlName }), type: field[2] });
    }
  });
  return out;
}
