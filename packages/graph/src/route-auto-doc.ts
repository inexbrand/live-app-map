/**
 * Описание роута, собранное из кода: обработчик, вход, таблицы, доступ, ответ —
 * отдельно от авторского (JSDoc и комментарии). И причина, по которой роут
 * не вызывается экранами карты.
 */
import type { ApiCall, ApiRoute, RouteInputSchema } from '@live-app-map/schema';
import { routeDetail, type CodeIndex, type TableTouch } from './code-query';

/** Пометка автоописания: показывается рядом с текстом везде. */
export const AUTO_DOC_NOTE = 'описание собрано из кода';

/** Строка автоописания: что и значение. */
export type AutoDocLine = { readonly label: string; readonly text: string };

/** Автоописание роута. */
export type RouteAutoDoc = {
  /** Одна строка: действие, таблицы, ответ. */
  readonly summary: string;
  readonly lines: readonly AutoDocLine[];
  /** Сколько фактов из кода нашлось помимо обработчика (вход, таблицы, доступ, ответ). */
  readonly facts: number;
};

/** Почему роут не вызывается экранами. */
export type ScreenGapKind = 'unreached' | 'other-client' | 'no-caller';

/** Причина «без экранов». */
export type ScreenGap = {
  readonly kind: ScreenGapKind;
  /** Текст для человека. */
  readonly text: string;
  /** Файлы вызовов (для unreached и other-client). */
  readonly files: readonly string[];
};

const ACTION: Readonly<Record<string, string>> = {
  GET: 'Чтение',
  HEAD: 'Чтение',
  POST: 'Запись',
  PUT: 'Изменение',
  PATCH: 'Изменение',
  DELETE: 'Удаление',
  OPTIONS: 'Служебный',
  ALL: 'Обработка',
};

/** Предел длины краткой строки. */
const SUMMARY_MAX = 220;

/** Что делает роут по методу и пути: «Изменение «vacancies» по id». */
function action(route: ApiRoute): string {
  const segs = route.path.split('/').filter((s) => s !== '');
  const isParam = (s: string): boolean => s.startsWith(':') || s.startsWith('{') || s === '*';
  const last = segs[segs.length - 1];
  const resource = [...segs].reverse().find((s) => !isParam(s));
  const param = last !== undefined && isParam(last) ? last.replace(/^[:{]|[}?]$/g, '') : undefined;
  const verb = ACTION[route.method] ?? 'Обработка';
  if (resource === undefined) {
    return `${verb} «${route.path}»`;
  }
  return `${verb} «${resource}»${param === undefined || param === '*' ? '' : ` по ${param}`}`;
}

/** Поля схемы входа строкой. */
function schemaText(s: RouteInputSchema): string {
  if (s.fields.length === 0) {
    return s.name ?? s.text ?? 'схема';
  }
  return s.fields.map((f) => `${f.name}${f.optional === true ? '?' : ''}`).join(', ');
}

/** Имена таблиц: имя в БД, иначе в коде. */
function tableNames(list: readonly TableTouch[]): string {
  return list.map((t) => t.dbName ?? t.table).join(', ');
}

/** Строки входа: body, query, params, headers. */
function inputLines(route: ApiRoute): AutoDocLine[] {
  const parts: [string, RouteInputSchema | undefined][] = [
    ['тело', route.input?.body],
    ['query', route.input?.query],
    ['параметры пути', route.input?.params],
    ['заголовки', route.input?.headers],
  ];
  const text = parts.flatMap(([name, s]) => (s === undefined ? [] : [`${name}: ${schemaText(s)}`])).join('; ');
  return text === '' ? [] : [{ label: 'Вход', text }];
}

/** Строка доступа. */
function accessText(route: ApiRoute): string | undefined {
  const a = route.access;
  if (a === undefined) {
    return undefined;
  }
  const parts = [
    a.auth === true ? 'нужен вход' : '',
    (a.roles?.length ?? 0) > 0 ? `роли ${a.roles?.join(', ')}` : '',
    (a.permissions?.length ?? 0) > 0 ? `права ${a.permissions?.join(', ')}` : '',
    (a.checks?.length ?? 0) > 0 ? `проверки ${a.checks?.join(', ')}` : '',
  ].filter((p) => p !== '');
  return parts.length === 0 ? undefined : parts.join('; ');
}

/** Строка ответа. */
function responseText(route: ApiRoute): string | undefined {
  const r = route.response;
  if (r === undefined) {
    return undefined;
  }
  const parts = [
    (r.fields?.length ?? 0) > 0 ? `поля ${r.fields?.join(', ')}` : '',
    (r.values?.length ?? 0) > 0 ? `возвращает ${r.values?.join(', ')}` : '',
    (r.statuses?.length ?? 0) > 0 ? `статусы ${r.statuses?.join(', ')}` : '',
  ].filter((p) => p !== '');
  return parts.length === 0 ? undefined : parts.join('; ');
}

/**
 * Автоописание роута из кода. Есть у любого роута (как минимум действие и обработчик).
 *
 * @param index - индекс кода
 * @param route - роут
 * @returns краткая строка и строки по разделам
 */
export function routeAutoDoc(index: CodeIndex, route: ApiRoute): RouteAutoDoc {
  const detail = routeDetail(index, route.id);
  const reads = detail?.reads ?? [];
  const writes = detail?.writes ?? [];
  const handler = route.handler.name ?? 'встроенная функция';
  const lines: AutoDocLine[] = [{ label: 'Обработчик', text: `${handler} · ${route.handler.location.file}:${route.handler.location.line}` }];
  lines.push(...inputLines(route));
  if (reads.length > 0) {
    lines.push({ label: 'Читает', text: tableNames(reads) });
  }
  if (writes.length > 0) {
    lines.push({ label: 'Пишет', text: tableNames(writes) });
  }
  const access = accessText(route);
  if (access !== undefined) {
    lines.push({ label: 'Доступ', text: access });
  }
  const response = responseText(route);
  if (response !== undefined) {
    lines.push({ label: 'Ответ', text: response });
  }
  const summaryParts = [
    action(route),
    reads.length > 0 ? `читает ${tableNames(reads)}` : '',
    writes.length > 0 ? `пишет ${tableNames(writes)}` : '',
    route.response?.fields !== undefined ? `ответ {${route.response.fields.join(', ')}}` : '',
  ].filter((p) => p !== '');
  const summary = summaryParts.join('; ');
  return {
    summary: summary.length > SUMMARY_MAX ? `${summary.slice(0, SUMMARY_MAX - 1)}…` : summary,
    lines,
    facts: lines.length - 1,
  };
}

/** Вид роута по пути и файлу, когда его никто не вызывает. */
const NO_CALLER_KINDS: readonly [RegExp, string][] = [
  [/webhook|callback|\/hooks?\b/i, 'вебхук: вызывает внешний сервис'],
  [/(^|\/)(bot|telegram)(\/|$)|apps\/bot\//i, 'бот: вызывает Telegram или бот'],
  [/internal|\/_[a-z]/i, 'внутренний: вызывают другие сервисы'],
  [/cron|\/jobs?\b|\/tasks?\b|schedul/i, 'крон или фоновая задача'],
  [/health|ready|live|metrics|\/ping\b|\/version\b/i, 'служебный: проверка живости или метрики'],
  [/\/(dev|debug|test|e2e|dogfood)\b/i, 'для разработки и тестов'],
  [/auth|login|logout|session|refresh|token|otp/i, 'вход и сессия: вызывает оболочка или внешний вход'],
];

/** Сервис файла: самый длинный корень, в который входит файл. */
function serviceOfFile(index: CodeIndex, file: string): string | undefined {
  let best: { id: string; len: number } | undefined;
  for (const s of index.code.services) {
    const root = s.root === '.' ? '' : `${s.root}/`;
    if (file.startsWith(root) && (best === undefined || root.length > best.len)) {
      best = { id: s.id, len: root.length };
    }
  }
  return best?.id;
}

/** Сервисы, в которых лежат экраны карты. */
const screenServicesCache = new WeakMap<CodeIndex, ReadonlySet<string>>();

function screenServices(index: CodeIndex): ReadonlySet<string> {
  let set = screenServicesCache.get(index);
  if (set === undefined) {
    set = new Set((index.code.screens ?? []).flatMap((s) => serviceOfFile(index, s.file) ?? []));
    screenServicesCache.set(index, set);
  }
  return set;
}

/** Вызовы роута по id (кэш на индекс). */
const callsCache = new WeakMap<CodeIndex, ReadonlyMap<string, readonly ApiCall[]>>();

function callsOf(index: CodeIndex, routeId: string): readonly ApiCall[] {
  let m = callsCache.get(index);
  if (m === undefined) {
    const built = new Map<string, ApiCall[]>();
    for (const c of index.code.apiCalls ?? []) {
      if (c.routeId !== undefined) {
        built.set(c.routeId, [...(built.get(c.routeId) ?? []), c]);
      }
    }
    m = built;
    callsCache.set(index, m);
  }
  return m.get(routeId) ?? [];
}

/**
 * Почему роут не вызывается экранами карты.
 *
 * @param index - индекс кода
 * @param route - роут
 * @returns причина или undefined, если экраны его вызывают
 */
export function routeScreenGap(index: CodeIndex, route: ApiRoute): ScreenGap | undefined {
  if ((index.callersByRoute.get(route.id)?.length ?? 0) > 0) {
    return undefined;
  }
  const calls = callsOf(index, route.id);
  const files = [...new Set(calls.map((c) => c.location.file))];
  if (calls.length === 0) {
    const hay = `${route.path} ${route.location.file}`;
    const kind = NO_CALLER_KINDS.find(([re]) => re.test(hay))?.[1] ?? 'в коде репозитория вызова нет (внешний клиент или не используется)';
    return { kind: 'no-caller', text: kind, files };
  }
  const screens = screenServices(index);
  if (calls.every((c) => !screens.has(c.serviceId))) {
    const names = [...new Set(calls.map((c) => index.servicesById.get(c.serviceId)?.name ?? c.serviceId))];
    return { kind: 'other-client', text: `вызывается не из экранов карты: ${names.join(', ')}`, files };
  }
  return {
    kind: 'unreached',
    text: 'вызов есть в приложении с экранами, но ни один экран до него не доходит (оболочка, вход или неиспользуемый код)',
    files,
  };
}
