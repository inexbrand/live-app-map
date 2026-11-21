/**
 * Модель исходного кода в карте (formatVersion 2): сервисы, символы с
 * комментариями, HTTP-роуты, вызовы БД и таблицы.
 *
 * Все пути — относительно `CodeModel.root` (каталог скана исходников), в POSIX-виде; строки — с 1.
 */

/** Вид символа исходного кода. */
export type CodeSymbolKind =
  | 'function'
  | 'class'
  | 'component'
  | 'variable'
  | 'interface'
  | 'type';

/** HTTP-метод роута; `ALL` — обработчик на любой метод (`app.all`, `app.use` с путём). */
export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'OPTIONS'
  | 'HEAD'
  | 'ALL';

/** Веб-фреймворк, в котором объявлен роут. */
export type RouteFramework = 'elysia' | 'hono' | 'express';

/** ORM, через которую идёт запрос или объявлена таблица. */
export type OrmKind = 'drizzle' | 'prisma';

/** Вид операции с БД. */
export type DbOperation = 'select' | 'insert' | 'update' | 'delete' | 'upsert' | 'count';

/** Место в исходнике. */
export type SourceLocation = {
  readonly file: string;
  readonly line: number;
};

/**
 * Комментарии, привязанные к сущности.
 * `doc` — текст JSDoc без звёздочек; `comments` — обычные `//` и `/* *\/` перед сущностью.
 */
export type CodeComments = {
  readonly doc?: string;
  readonly comments?: readonly string[];
};

/** Сервис — пакет монорепо (каталог с package.json), которому принадлежат файлы. */
export type CodeService = {
  readonly id: string;
  readonly name: string;
  /** Каталог сервиса относительно CodeModel.root; `.` — сам корень. */
  readonly root: string;
};

/** Экспортируемый символ: функция, класс, React-компонент, константа, тип. */
export type CodeSymbol = CodeComments & {
  readonly id: string;
  readonly kind: CodeSymbolKind;
  readonly name: string;
  readonly serviceId: string;
  readonly location: SourceLocation;
  /** Сигнатура одной строкой: `(id: string) => Promise<User>`. */
  readonly signature?: string;
};

/** Обращение к БД. */
export type DbCall = {
  readonly orm: OrmKind;
  readonly operation: DbOperation;
  /** Имя таблицы как в коде (переменная Drizzle или модель Prisma). */
  readonly table: string;
  readonly location: SourceLocation;
  /** Через какую функцию найден вызов, если не прямо в обработчике. */
  readonly via?: string;
  /** Вызов выполняется в цикле (for/while, .map/.forEach) — признак N+1. */
  readonly inLoop?: boolean;
};

/** Поле схемы входа роута. */
export type RouteSchemaField = {
  readonly name: string;
  /** Тип текстом: `string`, `number`, `string[]`, `'a' | 'b'`, `object`, имя схемы. */
  readonly type: string;
  readonly optional?: boolean;
};

/** Чем объявлена схема входа: Elysia `t.*` (TypeBox) или zod. */
export type RouteSchemaKind = 'typebox' | 'zod';

/** Схема одной части входа (body, query, params, headers). */
export type RouteInputSchema = {
  readonly kind: RouteSchemaKind;
  /** Имя константы, если схема передана по имени. */
  readonly name?: string;
  /** Поля объекта; пусто — схема не объект или не разобрана (тогда есть text). */
  readonly fields: readonly RouteSchemaField[];
  /** Текст схемы, если поля не разобраны (до 200 символов). */
  readonly text?: string;
};

/** Проверка входа роута: какие части запроса проверяются схемой. */
export type RouteInput = {
  readonly body?: RouteInputSchema;
  readonly query?: RouteInputSchema;
  readonly params?: RouteInputSchema;
  readonly headers?: RouteInputSchema;
};

/**
 * Доступ к роуту, найденный в коде обработчика и его цепочки:
 * сравнения роли с литералом, проверки прав, функции-проверки.
 */
export type RouteAccess = {
  /** Нужен вход: найдена проверка пользователя или ответ 401. */
  readonly auth?: boolean;
  /** Роли из сравнений `viewer.role === 'admin'`. */
  readonly roles?: readonly string[];
  /** Права из вызовов `requirePermission(user, 'admin.access')`. */
  readonly permissions?: readonly string[];
  /** Функции-проверки, вызванные обработчиком: `requireAdminAccess`, `requireEmployer`. */
  readonly checks?: readonly string[];
};

/** Ответ обработчика, найденный в коде. Поля пишутся, только если найдены. */
export type RouteResponse = {
  /** Поля возвращаемого объекта (`return { items, total }`, `c.json({…})`); `...x` — развёрнутый объект. */
  readonly fields?: readonly string[];
  /** Что возвращается, если не литерал: переменная (`user`) или вызов (`findUser()`). */
  readonly values?: readonly string[];
  /** HTTP-статусы, которые обработчик ставит явно (`set.status = 404`, `res.status(403)`). */
  readonly statuses?: readonly number[];
};

/** HTTP-роут бэкенда. */
export type ApiRoute = CodeComments & {
  readonly id: string;
  readonly framework: RouteFramework;
  readonly method: HttpMethod;
  readonly path: string;
  readonly serviceId: string;
  readonly location: SourceLocation;
  /** Именованный обработчик (если передан по имени) и его место. */
  readonly handler: {
    readonly name?: string;
    readonly location: SourceLocation;
  };
  readonly dbCalls: readonly DbCall[];
  /** Схемы входа из опций роута; нет — проверка входа не найдена. */
  readonly input?: RouteInput;
  /** Доступ; нет — проверок в коде не найдено. */
  readonly access?: RouteAccess;
  /** Ответ обработчика; нет — в коде не найден. */
  readonly response?: RouteResponse;
};

/** Внешний ключ колонки: на какую таблицу и колонку ссылается. */
export type DbReference = {
  /** Имя таблицы в коде (exportName): переменная Drizzle или модель Prisma. */
  readonly table: string;
  /** Колонка цели (имя свойства в коде). */
  readonly column: string;
  /** Поведение при удалении цели: `cascade`, `restrict`, `Cascade` … как в схеме. */
  readonly onDelete?: string;
};

/** Колонка таблицы. Флаги пишутся только со значением true. */
export type DbColumn = {
  /** Имя свойства в коде. */
  readonly name: string;
  /** Имя колонки в БД, если отличается. */
  readonly sqlName?: string;
  /** Тип: `text`, `integer`, `timestamp`, `String`, `Int` … (без признака NULL). */
  readonly type: string;
  readonly primaryKey?: boolean;
  /** NOT NULL: Drizzle `.notNull()`/`.primaryKey()`, Prisma — поле без `?`. */
  readonly notNull?: boolean;
  readonly unique?: boolean;
  /** Значение по умолчанию текстом схемы: `'draft'`, `now()`, `autoincrement()`. */
  readonly default?: string;
  /** Допустимые значения: Drizzle `{ enum: [...] }`, Prisma `enum`. */
  readonly enumValues?: readonly string[];
  readonly references?: DbReference;
  /** JSDoc или `///` колонки. */
  readonly doc?: string;
};

/** Таблица (Drizzle) или модель (Prisma). */
export type DbTable = CodeComments & {
  readonly id: string;
  readonly orm: OrmKind;
  /** Имя таблицы в БД. */
  readonly name: string;
  /** Имя в коде: переменная Drizzle или модель Prisma. */
  readonly exportName: string;
  readonly serviceId: string;
  readonly location: SourceLocation;
  readonly columns: readonly DbColumn[];
};

/** Чем фронтенд вызывает API. `wrapper` — функция проекта поверх fetch/axios/ky. */
export type ApiClientKind = 'fetch' | 'axios' | 'ky' | 'eden' | 'hono-rpc' | 'wrapper';

/** Вызов HTTP API из кода (обычно фронтенда). */
export type ApiCall = {
  readonly id: string;
  readonly serviceId: string;
  readonly method: HttpMethod;
  /** Путь без origin и query; динамические сегменты — `:имя`: `/api/users/:id`. */
  readonly path: string;
  readonly client: ApiClientKind;
  /** Обёртка проекта, через которую идёт вызов (`apiFetch`, `api.get`). */
  readonly via?: string;
  readonly location: SourceLocation;
  /** Роут бэкенда, с которым сопоставлен вызов; нет — не сопоставлен. */
  readonly routeId?: string;
};

/** Вызов API, достижимый из экрана. */
export type ScreenApiCall = {
  readonly callId: string;
  /** Первая функция или компонент на пути от экрана к вызову; нет — вызов в самом файле экрана. */
  readonly via?: string;
};

/** Экран (файл компонента страницы) и вызовы API, достижимые из него по вызовам и JSX. */
export type ScreenApi = {
  /** Нода экрана; нет — экран определяется файлом (один экран на файл). */
  readonly nodeId?: string;
  /** Файл экрана от CodeModel.root (для React Router — файл конфига роутов). */
  readonly file: string;
  readonly calls: readonly ScreenApiCall[];
};

/** Раздел `code` документа карты. */
export type CodeModel = {
  /** Каталог, который сканировался; от него считаются все пути раздела. */
  readonly root: string;
  readonly services: readonly CodeService[];
  readonly symbols: readonly CodeSymbol[];
  readonly routes: readonly ApiRoute[];
  readonly tables: readonly DbTable[];
  /** Вызовы API из кода; нет в картах, снятых до появления поиска вызовов. */
  readonly apiCalls?: readonly ApiCall[];
  /** Экраны карты и их вызовы API; есть, когда скану переданы файлы экранов. */
  readonly screens?: readonly ScreenApi[];
};
