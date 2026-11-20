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
};

/** Колонка таблицы. */
export type DbColumn = {
  /** Имя свойства в коде. */
  readonly name: string;
  /** Имя колонки в БД, если отличается. */
  readonly sqlName?: string;
  /** Тип: `text`, `integer`, `timestamp`, `String`, `Int?` … */
  readonly type: string;
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
  /** Файл экрана от CodeModel.root. */
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
