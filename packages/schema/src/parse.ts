/**
 * Парсинг и валидация документов на границах.
 */
import type { AppMapDocument, Diagnostic, LiveAppMapDocument } from './types';
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
 * Валидирует enterprise AppMapDocument.
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
  const doc = result.data as AppMapDocument;
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
        code: 'DANGLING_EDGE_FROM',
        severity: 'warning',
        message: `Ребро ${edge.id}: from=${edge.from} не найден`,
      });
    }
    if (edge.to !== null && !ids.has(edge.to)) {
      warnings.push({
        code: 'DANGLING_EDGE_TO',
        severity: 'warning',
        message: `Ребро ${edge.id}: to=${edge.to} не найден`,
      });
    }
  }
  return { ok: true, document: doc, warnings };
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
  const warnings: Diagnostic[] = [];
  const major =
    typeof doc.version === 'number'
      ? Math.floor(doc.version)
      : Number.parseInt(String(doc.version).split('.')[0] ?? '0', 10);
  if (major !== 1 && !Number.isNaN(major) && major > 1) {
    return {
      ok: false,
      errors: [
        {
          code: 'UNSUPPORTED_VERSION',
          severity: 'error',
          message: `Неподдерживаемая major-версия liveappmap: ${doc.version}`,
        },
      ],
      warnings,
    };
  }
  const ids = new Set(doc.pages.map((p) => p.id));
  if (ids.size !== doc.pages.length) {
    warnings.push({
      code: 'DUPLICATE_PAGE_ID',
      severity: 'warning',
      message: 'Обнаружены дубликаты page.id',
    });
  }
  for (const page of doc.pages) {
    if (!page.url && !page.path) {
      warnings.push({
        code: 'NO_URL',
        severity: 'warning',
        message: `Страница ${page.id} без url/path — iframe будет отключён`,
        path: page.id,
      });
    }
  }
  return { ok: true, document: doc, warnings };
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
