/**
 * Контракт живых данных БД между dev-сервером визуализатора и видом «База данных».
 *
 * Все значения ячеек — текст Postgres (`col::text`) или null: так сетка одинаково
 * показывает и правит любой тип, а сервер передаёт текст параметром и Postgres сам
 * приводит его к типу колонки.
 *
 * Эндпоинты (только dev, только локальный origin):
 * - `GET  /__lam_db/status` → {@link DbStatus};
 * - `GET  /__lam_db/rows?table=&page=&size=&sort=&dir=&filterColumn=&filterValue=` → {@link RowsPage};
 * - `POST /__lam_db/changes` тело {@link DbChanges} → {@link ChangesResult}.
 * Ошибка — код 4xx/5xx и тело {@link DbError}.
 */
import { z } from 'zod';

/** Префикс эндпоинтов живых данных. */
export const DB_DATA_PATH = '/__lam_db';

/** Строк на странице сетки. */
export const DB_PAGE_SIZE = 50;

/** Значение ячейки: текст Postgres или null. */
export const dbCellSchema = z.string().nullable();
/** Значение ячейки. */
export type DbCell = z.infer<typeof dbCellSchema>;

/** Строка: имя колонки в БД → значение. */
export const dbRowSchema = z.record(z.string(), dbCellSchema);
/** Строка таблицы. */
export type DbRow = z.infer<typeof dbRowSchema>;

/** Колонка живой таблицы (из information_schema). */
export const dbLiveColumnSchema = z.object({
  /** Имя колонки в БД. */
  name: z.string().min(1),
  /** Тип Postgres (udt_name): `text`, `int4`, `bool`, `jsonb`, `timestamptz`, имя enum. */
  type: z.string().min(1),
  nullable: z.boolean(),
  /** Есть DEFAULT или identity: при вставке можно не задавать. */
  hasDefault: z.boolean(),
  /** Значения enum-типа; нет — колонка не enum. */
  enumValues: z.array(z.string()).optional(),
});
/** Колонка живой таблицы. */
export type DbLiveColumn = z.infer<typeof dbLiveColumnSchema>;

/** Состояние подключения. */
export const dbStatusSchema = z.discriminatedUnion('state', [
  /** В config.ts нет поля database или переменная не найдена: что вписать. */
  z.object({ state: z.literal('off'), reason: z.string(), hint: z.string() }),
  /** Адрес есть, подключиться не вышло. */
  z.object({ state: z.literal('error'), message: z.string() }),
  z.object({
    state: z.literal('ready'),
    host: z.string(),
    database: z.string(),
    /** Запись разрешена (хост локальный). */
    writable: z.boolean(),
    /** Почему только чтение; есть, когда writable = false. */
    readOnlyReason: z.string().optional(),
  }),
]);
/** Состояние подключения к БД. */
export type DbStatus = z.infer<typeof dbStatusSchema>;

/** Направление сортировки. */
export const sortDirSchema = z.enum(['asc', 'desc']);
/** Направление сортировки. */
export type SortDir = z.infer<typeof sortDirSchema>;

/** Запрос страницы (query-параметры GET /rows). */
export const rowsQuerySchema = z.object({
  /** Имя таблицы в БД (DbTable.name). */
  table: z.string().min(1),
  page: z.coerce.number().int().nonnegative(),
  size: z.coerce.number().int().positive().max(500),
  sort: z.string().min(1).optional(),
  dir: sortDirSchema.optional(),
  /** Фильтр «колонка = значение» (сравнение текстом: col::text = value). */
  filterColumn: z.string().min(1).optional(),
  filterValue: z.string().optional(),
});
/** Запрос страницы. */
export type RowsQuery = z.infer<typeof rowsQuerySchema>;

/** Страница строк. */
export const rowsPageSchema = z.object({
  table: z.string(),
  columns: z.array(dbLiveColumnSchema),
  /** Колонки первичного ключа; пусто — таблица только для чтения. */
  primaryKey: z.array(z.string()),
  rows: z.array(dbRowSchema),
  /** Всего строк с учётом фильтра. */
  total: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
  size: z.number().int().positive(),
});
/** Страница строк. */
export type RowsPage = z.infer<typeof rowsPageSchema>;

/** Правка строки: ключ — значения PK, set — новые значения колонок. */
export const dbUpdateSchema = z.object({ key: dbRowSchema, set: dbRowSchema });
/** Правка строки. */
export type DbUpdate = z.infer<typeof dbUpdateSchema>;

/** Пакет правок одной таблицы: применяется одной транзакцией, ошибка — откат всего. */
export const dbChangesSchema = z.object({
  table: z.string().min(1),
  /** Новые строки: только заданные колонки (остальные — DEFAULT). */
  inserts: z.array(dbRowSchema),
  updates: z.array(dbUpdateSchema),
  /** Ключи удаляемых строк (значения PK). */
  deletes: z.array(dbRowSchema),
});
/** Пакет правок. */
export type DbChanges = z.infer<typeof dbChangesSchema>;

/** Итог применения пакета. */
export const changesResultSchema = z.object({
  inserted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
});
/** Итог применения пакета. */
export type ChangesResult = z.infer<typeof changesResultSchema>;

/** Тело ошибки: текст для человека. */
export const dbErrorSchema = z.object({ error: z.string() });
/** Тело ошибки. */
export type DbError = z.infer<typeof dbErrorSchema>;
