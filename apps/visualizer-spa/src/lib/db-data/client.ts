/**
 * Клиент живых данных БД: запросы к эндпоинтам dev-сервера визуализатора по контракту
 * {@link ./contract.ts}. Ответы проверяются схемами контракта; ошибка сервера превращается
 * в {@link DbDataError} с текстом из тела {@link DbError}.
 */
import {
  changesResultSchema,
  DB_DATA_PATH,
  dbErrorSchema,
  dbStatusSchema,
  rowsPageSchema,
  type ChangesResult,
  type DbChanges,
  type DbStatus,
  type RowsPage,
  type RowsQuery,
} from './contract';
import type { ZodType } from 'zod';

/** Ошибка запроса к живым данным: текст для человека. */
export class DbDataError extends Error {
  constructor(
    message: string,
    /** Код HTTP; null — сервер не ответил. */
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'DbDataError';
  }
}

/** Клиент живых данных одной БД проекта. */
export type DbDataClient = {
  /** Состояние подключения. */
  status(): Promise<DbStatus>;
  /** Страница строк таблицы. */
  rows(query: RowsQuery): Promise<RowsPage>;
  /** Применить пакет правок одной транзакцией. */
  applyChanges(changes: DbChanges): Promise<ChangesResult>;
};

/** Query-строка запроса страницы: пустые необязательные поля не передаются. */
export function rowsSearch(query: RowsQuery): string {
  const params = new URLSearchParams();
  params.set('table', query.table);
  params.set('page', String(query.page));
  params.set('size', String(query.size));
  if (query.sort !== undefined) {
    params.set('sort', query.sort);
    if (query.dir !== undefined) {
      params.set('dir', query.dir);
    }
  }
  if (query.filterColumn !== undefined && query.filterValue !== undefined) {
    params.set('filterColumn', query.filterColumn);
    params.set('filterValue', query.filterValue);
  }
  return params.toString();
}

async function errorText(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = dbErrorSchema.safeParse(JSON.parse(text));
    if (parsed.success) {
      return parsed.data.error;
    }
  } catch {
    // тело не JSON — покажем как есть
  }
  const body = text.trim().slice(0, 300);
  return body === '' ? `сервер ответил ${res.status} без текста ошибки` : `сервер ответил ${res.status}: ${body}`;
}

async function request<T>(url: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    throw new DbDataError(`dev-сервер визуализатора не отвечает (${url}): ${why}`, null);
  }
  if (!res.ok) {
    throw new DbDataError(await errorText(res), res.status);
  }
  const body: unknown = await res.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue === undefined ? '' : ` (${issue.path.join('.')}: ${issue.message})`;
    throw new DbDataError(`ответ ${url} не по контракту${where}`, res.status);
  }
  return parsed.data;
}

/**
 * Клиент живых данных.
 *
 * @param base - адрес dev-сервера без завершающей черты; пустая строка — тот же origin, что у страницы
 */
export function createDbDataClient(base: string): DbDataClient {
  const root = `${base}${DB_DATA_PATH}`;
  return {
    status: () => request(`${root}/status`, dbStatusSchema),
    rows: (query) => request(`${root}/rows?${rowsSearch(query)}`, rowsPageSchema),
    applyChanges: (changes) =>
      request(`${root}/changes`, changesResultSchema, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(changes),
      }),
  };
}

/** Клиент страницы визуализатора: эндпоинты на том же origin. */
export const pageDbDataClient: DbDataClient = createDbDataClient('');
