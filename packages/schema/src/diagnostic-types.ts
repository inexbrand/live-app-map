/**
 * Диагностики разбора и скана: уровень, коды схемы, запись.
 */


export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * Коды, которые emit-ит сам `@live-app-map/schema` (parse / boundary).
 *
 * ## Split: SchemaDiagnosticCode vs DiagnosticCode
 *
 * | Слой | Где живёт | Назначение |
 * |------|-----------|------------|
 * | Wire `Diagnostic` | этот пакет (`code: string`) | единый value-object для CLI/SPA/scanners |
 * | `SchemaDiagnosticCode` | этот пакет | parse/convert boundary (Zod, JSON, graph-warnings) |
 * | `DiagnosticCode` | `@live-app-map/diagnostics` | закрытый scan-каталог + RU titles/`diag()` |
 *
 * **Почему не union в schema:** diagnostics зависит от schema (`import type { Diagnostic }`).
 * Re-export `DiagnosticCode` сюда создал бы cycle. Закрытый scan-каталог —
 * single source of truth в `@live-app-map/diagnostics`; schema-коды — здесь.
 * Пересечения (`DUPLICATE_NODE_ID`, `DANGLING_EDGE`) намеренные: один wire-тип,
 * два источника эмиссии (parse vs scan/normalize).
 */
export type SchemaDiagnosticCode =
  | 'INVALID_APPMAP_DOCUMENT'
  | 'INVALID_LIVEAPPMAP'
  | 'INVALID_JSON'
  | 'UNSUPPORTED_VERSION'
  | 'DUPLICATE_NODE_ID'
  | 'DUPLICATE_PAGE_ID'
  | 'DANGLING_EDGE'
  | 'NO_URL';

/**
 * Runtime-список schema-кодов (для CLI/тестов/guard-ов).
 * Не путать с `getCatalog()` из `@live-app-map/diagnostics`.
 */
export const SCHEMA_DIAGNOSTIC_CODES: readonly SchemaDiagnosticCode[] = [
  'INVALID_APPMAP_DOCUMENT',
  'INVALID_LIVEAPPMAP',
  'INVALID_JSON',
  'UNSUPPORTED_VERSION',
  'DUPLICATE_NODE_ID',
  'DUPLICATE_PAGE_ID',
  'DANGLING_EDGE',
  'NO_URL',
] as const;

/**
 * Канонический wire-тип diagnostic (schema + scanners + CLI + SPA).
 *
 * `code` — открытая `string`: schema-коды (`SchemaDiagnosticCode`), scan-коды
 * (`DiagnosticCode` из `@live-app-map/diagnostics`) и plugin/future codes.
 * Не сужаем до union — иначе diagnostics/plugins не смогут расширять без bump schema.
 */
export type Diagnostic = {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
  readonly file?: string;
  readonly hint?: string;
};

/**
 * Type guard: код — известный schema boundary diagnostic.
 *
 * @param code - произвольная строка diagnostic.code
 * @returns true, если code ∈ SchemaDiagnosticCode
 */
export function isSchemaDiagnosticCode(code: string): code is SchemaDiagnosticCode {
  return (SCHEMA_DIAGNOSTIC_CODES as readonly string[]).includes(code);
}
