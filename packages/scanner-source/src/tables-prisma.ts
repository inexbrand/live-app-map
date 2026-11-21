/**
 * Модели Prisma из `schema.prisma`: имя, `@@map`, поля, ключи, связи, enum, `///`-описания.
 */
import type { DbColumn, DbReference, SourceLocation } from '@live-app-map/schema';
import type { FoundTable } from './tables-drizzle';

/** Блок `model` или `enum` схемы. */
type Block = {
  readonly kind: 'model' | 'enum';
  readonly name: string;
  readonly location: SourceLocation;
  readonly doc: string;
  /** Строки тела с их `///`-описанием. */
  readonly lines: ReadonlyArray<{ readonly text: string; readonly doc: string }>;
};

/**
 * Делит схему на блоки model/enum, сохраняя `///` перед блоком и перед полем.
 *
 * @param text - содержимое schema.prisma
 * @param file - путь файла
 * @returns блоки по порядку
 */
function splitBlocks(text: string, file: string): Block[] {
  const out: Block[] = [];
  let docLines: string[] = [];
  let current: { kind: 'model' | 'enum'; name: string; location: SourceLocation; doc: string; lines: { text: string; doc: string }[] } | undefined;
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line.startsWith('///')) {
      docLines.push(line.replace(/^\/\/\/\s?/, ''));
      return;
    }
    if (current === undefined) {
      const head = /^(model|enum)\s+(\w+)\s*\{/.exec(line);
      if (head?.[1] !== undefined && head[2] !== undefined) {
        const kind = head[1] === 'model' ? 'model' : 'enum';
        current = { kind, name: head[2], location: { file, line: index + 1 }, doc: docLines.join('\n'), lines: [] };
      }
      docLines = [];
      return;
    }
    if (line.startsWith('}')) {
      out.push(current);
      current = undefined;
    } else if (line !== '' && !line.startsWith('//')) {
      current.lines.push({ text: line, doc: docLines.join('\n') });
    }
    docLines = [];
  });
  return out;
}

/** Аргумент атрибута `@name(...)` с учётом вложенных скобок. */
function attrArg(rest: string, name: string): string | undefined {
  const at = rest.indexOf(`@${name}(`);
  if (at < 0) {
    return undefined;
  }
  let depth = 0;
  const from = at + name.length + 2;
  for (let i = from - 1; i < rest.length; i++) {
    const ch = rest[i];
    depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
    if (depth === 0) {
      return rest.slice(from, i);
    }
  }
  return undefined;
}

/** Список `[a, b]` из аргументов @relation. */
function listArg(args: string, key: string): string[] {
  const m = new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`).exec(args);
  return m?.[1] === undefined ? [] : m[1].split(',').map((s) => s.trim()).filter((s) => s !== '');
}

/** Поле-связь: на какие колонки этой модели и цели оно указывает. */
type Relation = { readonly fields: string[]; readonly target: string; readonly references: string[]; readonly onDelete?: string };

/**
 * Модель → таблица: скалярные поля становятся колонками, поля-связи — ссылками колонок.
 *
 * @param block - блок model
 * @param models - имена моделей схемы
 * @param enums - enum схемы: имя → значения
 * @returns таблица
 */
function modelTable(block: Block, models: ReadonlySet<string>, enums: ReadonlyMap<string, string[]>): FoundTable {
  let table = block.name;
  const columns: DbColumn[] = [];
  const relations: Relation[] = [];
  const blockPk = new Set<string>();
  for (const { text, doc } of block.lines) {
    const mapTable = /^@@map\(\s*"([^"]+)"\s*\)/.exec(text);
    if (mapTable?.[1] !== undefined) {
      table = mapTable[1];
      continue;
    }
    const id = /^@@id\(\s*\[([^\]]*)\]/.exec(text);
    if (id?.[1] !== undefined) {
      id[1].split(',').forEach((s) => blockPk.add(s.trim()));
      continue;
    }
    const field = /^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/.exec(text);
    if (field?.[1] === undefined || field[2] === undefined) {
      continue;
    }
    const [, name, base, list, optional, rest = ''] = field;
    if (models.has(base)) {
      const rel = attrArg(rest, 'relation');
      const fields = rel === undefined ? [] : listArg(rel, 'fields');
      if (rel !== undefined && fields.length > 0) {
        const onDelete = /onDelete\s*:\s*(\w+)/.exec(rel)?.[1];
        relations.push({ fields, target: base, references: listArg(rel, 'references'), ...(onDelete === undefined ? {} : { onDelete }) });
      }
      continue;
    }
    const sqlName = /@map\(\s*"([^"]+)"\s*\)/.exec(rest)?.[1];
    const def = attrArg(rest, 'default');
    const values = enums.get(base);
    columns.push({
      name,
      ...(sqlName === undefined ? {} : { sqlName }),
      type: list === undefined ? base : `${base}[]`,
      ...(/@id\b/.test(rest) ? { primaryKey: true } : {}),
      ...(optional === undefined ? { notNull: true } : {}),
      ...(/@unique\b/.test(rest) ? { unique: true } : {}),
      ...(def === undefined ? {} : { default: def }),
      ...(values === undefined ? {} : { enumValues: values }),
      ...(doc === '' ? {} : { doc }),
    });
  }
  const withKeys = columns.map((c) => {
    const rel = relations.find((r) => r.fields.includes(c.name));
    const column = rel?.references[rel.fields.indexOf(c.name)];
    const references: DbReference | undefined = rel === undefined || column === undefined
      ? undefined
      : { table: rel.target, column, ...(rel.onDelete === undefined ? {} : { onDelete: rel.onDelete }) };
    const { doc, enumValues, ...head } = c;
    return {
      ...head,
      ...(blockPk.has(c.name) ? { primaryKey: true } : {}),
      ...(references === undefined ? {} : { references }),
      ...(enumValues === undefined ? {} : { enumValues }),
      ...(doc === undefined ? {} : { doc }),
    };
  });
  return {
    orm: 'prisma',
    name: table,
    exportName: block.name,
    location: block.location,
    columns: withKeys,
    ...(block.doc === '' ? {} : { doc: block.doc }),
  };
}

/**
 * Разбирает текст schema.prisma.
 *
 * @param text - содержимое файла
 * @param file - путь файла относительно корня
 * @returns модели как таблицы
 */
export function parsePrismaSchema(text: string, file: string): FoundTable[] {
  const blocks = splitBlocks(text, file);
  const models = new Set(blocks.filter((b) => b.kind === 'model').map((b) => b.name));
  const enums = new Map(
    blocks
      .filter((b) => b.kind === 'enum')
      .map((b) => [b.name, b.lines.map((l) => l.text.split(/\s+/)[0] ?? '').filter((v) => /^\w+$/.test(v))] as const),
  );
  return blocks.filter((b) => b.kind === 'model').map((b) => modelTable(b, models, enums));
}
