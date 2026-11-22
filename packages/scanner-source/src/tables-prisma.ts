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
  let current: OpenBlock | undefined;
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line.startsWith('///')) {
      docLines.push(line.replace(/^\/\/\/\s?/, ''));
      return;
    }
    const doc = docLines.join('\n');
    docLines = [];
    if (current === undefined) {
      current = blockHead(line, { file, line: index + 1 }, doc);
    } else if (line.startsWith('}')) {
      out.push(current);
      current = undefined;
    } else if (line !== '' && !line.startsWith('//')) {
      current.lines.push({ text: line, doc });
    }
  });
  return out;
}

/** Блок, тело которого ещё читается. */
type OpenBlock = Block & { readonly lines: { text: string; doc: string }[] };

/** Начало блока `model X {` / `enum X {`; иначе undefined. */
function blockHead(line: string, location: SourceLocation, doc: string): OpenBlock | undefined {
  const head = /^(model|enum)\s+(\w+)\s*\{/.exec(line);
  if (head?.[1] === undefined || head[2] === undefined) {
    return undefined;
  }
  return { kind: head[1] === 'model' ? 'model' : 'enum', name: head[2], location, doc, lines: [] };
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

/** Поле модели: `name Type[]? @attrs`. */
type Field = { readonly name: string; readonly base: string; readonly list: boolean; readonly optional: boolean; readonly rest: string; readonly doc: string };

/** Строка тела модели: `@@map`, `@@id`, поле; прочее (`@@index` …) — undefined. */
type ModelLine = { readonly kind: 'map'; readonly table: string } | { readonly kind: 'id'; readonly fields: readonly string[] } | ({ readonly kind: 'field' } & Field);

function modelLine(text: string, doc: string): ModelLine | undefined {
  const mapTable = /^@@map\(\s*"([^"]+)"\s*\)/.exec(text)?.[1];
  if (mapTable !== undefined) {
    return { kind: 'map', table: mapTable };
  }
  const id = /^@@id\(\s*\[([^\]]*)\]/.exec(text)?.[1];
  if (id !== undefined) {
    return { kind: 'id', fields: id.split(',').map((s) => s.trim()) };
  }
  const field = /^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/.exec(text);
  if (field?.[1] === undefined || field[2] === undefined) {
    return undefined;
  }
  return { kind: 'field', name: field[1], base: field[2], list: field[3] !== undefined, optional: field[4] !== undefined, rest: field[5] ?? '', doc };
}

/** Поле-связь с `@relation(fields: [...])`; без fields — undefined. */
function relationOf(f: Field): Relation | undefined {
  const rel = attrArg(f.rest, 'relation');
  const fields = rel === undefined ? [] : listArg(rel, 'fields');
  if (rel === undefined || fields.length === 0) {
    return undefined;
  }
  const onDelete = /onDelete\s*:\s*(\w+)/.exec(rel)?.[1];
  return { fields, target: f.base, references: listArg(rel, 'references'), ...(onDelete === undefined ? {} : { onDelete }) };
}

/** Ссылка колонки по первой связи, где она в fields. */
function referenceOf(name: string, relations: readonly Relation[]): DbReference | undefined {
  const rel = relations.find((r) => r.fields.includes(name));
  const column = rel?.references[rel.fields.indexOf(name)];
  return rel === undefined || column === undefined ? undefined : { table: rel.target, column, ...(rel.onDelete === undefined ? {} : { onDelete: rel.onDelete }) };
}

/** `{ key: value }`, если значение есть, иначе `{}`. */
function optionalField<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  const out: Partial<Record<K, V>> = {};
  if (value !== undefined) {
    out[key] = value;
  }
  return out;
}

/** `{ key: true }` при условии, иначе `{}`. */
function flagField<K extends string>(key: K, on: boolean): Partial<Record<K, true>> {
  return optionalField(key, on ? true : undefined);
}

/** Что нужно колонке от модели: связи, составной ключ, enum. */
type ModelKeys = { readonly relations: readonly Relation[]; readonly blockPk: ReadonlySet<string>; readonly enums: ReadonlyMap<string, string[]> };

/** Колонка скалярного поля (порядок ключей: составной ключ — после default). */
function columnOf(f: Field, keys: ModelKeys): DbColumn {
  const ownPk = /@id\b/.test(f.rest);
  return {
    name: f.name,
    ...optionalField('sqlName', /@map\(\s*"([^"]+)"\s*\)/.exec(f.rest)?.[1]),
    type: f.list ? `${f.base}[]` : f.base,
    ...flagField('primaryKey', ownPk),
    ...flagField('notNull', !f.optional),
    ...flagField('unique', /@unique\b/.test(f.rest)),
    ...optionalField('default', attrArg(f.rest, 'default')),
    ...flagField('primaryKey', !ownPk && keys.blockPk.has(f.name)),
    ...optionalField('references', referenceOf(f.name, keys.relations)),
    ...optionalField('enumValues', keys.enums.get(f.base)),
    ...optionalField('doc', f.doc === '' ? undefined : f.doc),
  };
}

/**
 * Модель → таблица: скалярные поля становятся колонками, поля-связи — ссылками колонок.
 *
 * @param block - блок model
 * @param models - имена моделей схемы
 * @param enums - enum схемы: имя → значения
 * @returns таблица
 */
function modelTable(block: Block, models: ReadonlySet<string>, enums: ReadonlyMap<string, string[]>): FoundTable {
  const lines = block.lines.map((l) => modelLine(l.text, l.doc));
  const table = lines.reduce((t, l) => (l?.kind === 'map' ? l.table : t), block.name);
  const blockPk = new Set(lines.flatMap((l) => (l?.kind === 'id' ? l.fields : [])));
  const fields = lines.filter((l): l is ModelLine & { readonly kind: 'field' } => l?.kind === 'field');
  const relations = fields.filter((f) => models.has(f.base)).flatMap((f) => relationOf(f) ?? []);
  const keys: ModelKeys = { relations, blockPk, enums };
  return {
    orm: 'prisma',
    name: table,
    exportName: block.name,
    location: block.location,
    columns: fields.filter((f) => !models.has(f.base)).map((f) => columnOf(f, keys)),
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
      .map((b): [string, string[]] => [b.name, b.lines.map((l) => l.text.split(/\s+/)[0] ?? '').filter((v) => /^\w+$/.test(v))]),
  );
  return blocks.filter((b) => b.kind === 'model').map((b) => modelTable(b, models, enums));
}
