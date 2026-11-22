/**
 * Общие части MCP-инструментов: типы, ответ ok/ошибка, чтение аргументов,
 * описание параметров и сборка каталога из инструментов с обработчиками.
 */

/** Описание инструмента для tools/list. */
export type ToolDef = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
};

/** Результат tools/call. */
export type ToolResult = {
  readonly content: ReadonlyArray<{ readonly type: 'text'; readonly text: string }>;
  readonly isError?: boolean;
};

/** Окружение инструментов. */
export type ToolContext = {
  /** Папка обмена (`resolveLamDir`). */
  readonly lamDir: string;
};

/** Аргументы вызова инструмента. */
export type ToolArgs = Readonly<Record<string, unknown>>;

/** Обработчик инструмента; ошибка-исключение превращается в isError в `callTool`. */
export type ToolHandler = (args: ToolArgs, ctx: ToolContext) => ToolResult;

/** Инструмент: описание и обработчик в одном месте. */
export type Tool = ToolDef & { readonly handler: ToolHandler };

/** Описание строкового параметра в inputSchema. */
export type StringProp = { readonly type: 'string'; readonly description: string };

/**
 * Успешный ответ: значение JSON-текстом.
 *
 * @param value - данные ответа
 */
export function ok(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/**
 * Ответ-ошибка с понятным текстом.
 *
 * @param text - что не так и что сделать
 */
export function fail(text: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

/**
 * Строковый аргумент как есть; пустая строка, если он не строка.
 *
 * @param args - аргументы вызова
 * @param key - имя аргумента
 */
export function rawStr(args: ToolArgs, key: string): string {
  const v = args[key];
  return typeof v === 'string' ? v : '';
}

/**
 * Строковый аргумент без пробелов по краям; пустая строка, если не задан.
 *
 * @param args - аргументы вызова
 * @param key - имя аргумента
 */
export function str(args: ToolArgs, key: string): string {
  return rawStr(args, key).trim();
}

/**
 * Необязательный строковый аргумент: null, если пустой.
 *
 * @param args - аргументы вызова
 * @param key - имя аргумента
 */
export function optionalStr(args: ToolArgs, key: string): string | null {
  const v = str(args, key);
  return v === '' ? null : v;
}

/**
 * Список непустых строк из аргумента-массива.
 *
 * @param args - аргументы вызова
 * @param key - имя аргумента
 */
export function strList(args: ToolArgs, key: string): string[] {
  const v = args[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
}

/**
 * Обязательный строковый аргумент.
 *
 * @param args - аргументы вызова
 * @param key - имя аргумента
 * @param hint - что вписать, для текста ошибки
 * @throws Error `<key> обязателен: <hint>`, если аргумент пустой
 */
export function requiredStr(args: ToolArgs, key: string, hint: string): string {
  const v = str(args, key);
  if (v === '') {
    throw new Error(`${key} обязателен: ${hint}`);
  }
  return v;
}

/**
 * Описание строкового параметра.
 *
 * @param description - подсказка агенту
 */
export function stringProp(description: string): StringProp {
  return { type: 'string', description };
}

/** Параметр mapPath: описание для схемы и чтение с проверкой. */
export type MapPathParam = {
  readonly prop: StringProp;
  /** Путь к карте; бросает Error с подсказкой, если не задан. */
  readonly read: (args: ToolArgs) => string;
};

/**
 * Параметр mapPath с подсказкой, какую карту передать.
 *
 * @param description - «Путь к карте …, например …»; та же строка — в тексте ошибки
 */
export function mapPathParam(description: string): MapPathParam {
  const hint = `${description.charAt(0).toLowerCase()}${description.slice(1)}`;
  return { prop: stringProp(description), read: (args) => requiredStr(args, 'mapPath', hint) };
}

/**
 * Объект без полей со значением undefined (порядок полей сохраняется).
 *
 * @param value - поля ответа
 */
export function defined(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}

/**
 * Каталог для tools/list: описания без обработчиков.
 *
 * @param tools - инструменты
 */
export function toolCatalog(tools: readonly Tool[]): ToolDef[] {
  return tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}
