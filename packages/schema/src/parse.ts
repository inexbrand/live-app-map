/**
 * Парсинг и валидация документов на границах.
 */
import type {
  AppMapDocument,
  AppMapDocumentV1,
  Diagnostic,
  LiveAppMapDocument,
} from './types';
import { upgradeAppMapDocument } from './upgrade';
import { appMapDocumentSchema, liveAppMapDocumentSchema } from './zod';

export type ParseOk<T> = {
  readonly ok: true;
  readonly document: T;
  readonly warnings: readonly Diagnostic[];
};

export type ParseFail = {
  readonly ok: false;
  readonly errors: readonly Diagnostic[];
  readonly warnings: readonly Diagnostic[];
};

export type ParseResult<T> = ParseOk<T> | ParseFail;

function zodIssuesToDiagnostics(
  issues: readonly { path: (string | number)[]; message: string }[],
  code: string,
): Diagnostic[] {
  return issues.map((issue) => ({
    code,
    severity: 'error' as const,
    message: issue.message,
    path: issue.path.join('.'),
  }));
}

/**
 * Валидирует enterprise AppMapDocument; документ v1 поднимается до текущей версии.
 */
export function parseAppMapDocument(input: unknown): ParseResult<AppMapDocument> {
  const result = appMapDocumentSchema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      errors: zodIssuesToDiagnostics(result.error.issues, 'INVALID_APPMAP_DOCUMENT'),
      warnings: [],
    };
  }
  const doc = upgradeAppMapDocument(result.data as AppMapDocument | AppMapDocumentV1);
  const warnings: Diagnostic[] = [];
  const ids = new Set<string>();
  for (const node of doc.nodes) {
    if (ids.has(node.id)) {
      warnings.push({
        code: 'DUPLICATE_NODE_ID',
        severity: 'warning',
        message: `Дубликат node id: ${node.id}`,
        path: node.id,
      });
    }
    ids.add(node.id);
  }
  for (const edge of doc.edges) {
    if (!ids.has(edge.from)) {
      warnings.push({
        code: 'DANGLING_EDGE',
        severity: 'warning',
        message: `Ребро ${edge.id}: from=${edge.from} не найден`,
        path: edge.id,
      });
    }
    if (edge.to !== null && !ids.has(edge.to)) {
      warnings.push({
        code: 'DANGLING_EDGE',
        severity: 'warning',
        message: `Ребро ${edge.id}: to=${edge.to} не найден`,
        path: edge.id,
      });
    }
  }
  return { ok: true, document: doc, warnings };
}

/** Major-версия формата: 1.2 и «1.2.3» → 1; нечисловая — NaN (не больше 1). */
function majorVersion(version: LiveAppMapDocument['version']): number {
  return typeof version === 'number' ? Math.floor(version) : Number.parseInt(String(version).split('.')[0] ?? '0', 10);
}

/** Предупреждения страниц: повторы id и страницы без адреса. */
function pageWarnings(doc: LiveAppMapDocument): Diagnostic[] {
  const warnings: Diagnostic[] = [];
  if (new Set(doc.pages.map((p) => p.id)).size !== doc.pages.length) {
    warnings.push({ code: 'DUPLICATE_PAGE_ID', severity: 'warning', message: 'Обнаружены дубликаты page.id' });
  }
  for (const page of doc.pages.filter((p) => !p.url && !p.path)) {
    warnings.push({
      code: 'NO_URL',
      severity: 'warning',
      message: `Страница ${page.id} без url/path — iframe будет отключён`,
      path: page.id,
    });
  }
  return warnings;
}

/**
 * Валидирует viewer liveappmap JSON.
 */
export function parseLiveAppMapDocument(input: unknown): ParseResult<LiveAppMapDocument> {
  const result = liveAppMapDocumentSchema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      errors: zodIssuesToDiagnostics(result.error.issues, 'INVALID_LIVEAPPMAP'),
      warnings: [],
    };
  }
  const doc = result.data as LiveAppMapDocument;
  if (majorVersion(doc.version) > 1) {
    return {
      ok: false,
      errors: [
        {
          code: 'UNSUPPORTED_VERSION',
          severity: 'error',
          message: `Неподдерживаемая major-версия liveappmap: ${doc.version}`,
        },
      ],
      warnings: [],
    };
  }
  return { ok: true, document: doc, warnings: pageWarnings(doc) };
}

/**
 * JSON.parse + parseLiveAppMapDocument.
 */
export function parseLiveAppMapJson(text: string): ParseResult<LiveAppMapDocument> {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      errors: [
        {
          code: 'INVALID_JSON',
          severity: 'error',
          message: `Невалидный JSON: ${message}`,
        },
      ],
      warnings: [],
    };
  }
  return parseLiveAppMapDocument(raw);
}
