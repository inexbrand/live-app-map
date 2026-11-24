/**
 * Публичный API `@live-app-map/schema` — единая точка входа monorepo.
 *
 * ## Поверхность (CLI / SPA / scanners / packages/*)
 *
 * | Модуль | Что re-export |
 * |--------|----------------|
 * | `./types` | document model, `FORMAT_VERSION`, `Diagnostic*`, `SchemaDiagnosticCode` |
 * | `./zod` | boundary Zod-схемы (`appMapDocumentSchema`, `liveAppMapDocumentSchema`, …) |
 * | `./parse` | `parseAppMapDocument`, `parseLiveAppMapDocument`, `parseLiveAppMapJson`, `ParseResult` |
 * | `./convert` | `appMapToLiveAppMap`, `liveAppMapToAppMap`, edge-kind guards |
 *
 * ## Diagnostic codes — split (не re-export)
 *
 * Закрытый scan-каталог `DiagnosticCode` + `diag()` / `formatDiagnostic` —
 * **только** в `@live-app-map/diagnostics` (нет cycle: diagnostics → schema).
 * Schema-коды parse: `SchemaDiagnosticCode` / `SCHEMA_DIAGNOSTIC_CODES` / `isSchemaDiagnosticCode`.
 * Wire-тип: `Diagnostic` (`code: string`) — общий для обоих слоёв.
 */
export {
  DEVICE_HEIGHT_FALLBACK,
  FORMAT_VERSION,
  SCHEMA_DIAGNOSTIC_CODES,
  isSchemaDiagnosticCode,
} from './types';
export type {
  AppMapDocument,
  AppMapDocumentV1,
  AppMapEdge,
  AppMapGroup,
  AppMapNode,
  AppMapApiOverride,
  AppMapPageState,
  AppMapStateKind,
  AppMapStateStep,
  Confidence,
  ConnectorScreenSize,
  DeviceViewport,
  Diagnostic,
  DiagnosticSeverity,
  EdgeKind,
  EdgeLayer,
  FrameworkKind,
  GeneratorMeta,
  LayoutHints,
  LiveAppMapDocument,
  LiveAppMapEdge,
  LiveAppMapPage,
  MapViewportPreset,
  NodeKind,
  ProjectMeta,
  SchemaDiagnosticCode,
  StateInjectSpec,
  SupportedFormatVersion,
  ViewportHeightMode,
} from './types';
export type {
  ApiCall,
  ApiClientKind,
  ApiRoute,
  CodeComments,
  CodeModel,
  CodeService,
  CodeSymbol,
  CodeSymbolKind,
  DbCall,
  DbColumn,
  DbReference,
  DbOperation,
  DbTable,
  HttpMethod,
  OrmKind,
  RouteAccess,
  RouteResponse,
  RouteFramework,
  RouteInput,
  RouteInputSchema,
  RouteSchemaField,
  RouteSchemaKind,
  ScreenApi,
  ScreenApiCall,
  SourceLocation,
} from './code-model';
export { codeModelSchema } from './code-model-zod';
export type { DocEpoch, DocFile, DocsModel, EpochReadiness } from './docs-model';
export { docsModelSchema } from './docs-model-zod';
export { codeFileOfNode, screenOf } from './code-path';
export { upgradeAppMapDocument } from './upgrade';

export {
  appMapDocumentSchema,
  appMapEdgeSchema,
  appMapGroupSchema,
  appMapNodeSchema,
  appMapPageStateSchema,
  appMapStateStepSchema,
  liveAppMapDocumentSchema,
  liveAppMapPageSchema,
  stateInjectSpecSchema,
} from './zod';

export {
  parseAppMapDocument,
  parseLiveAppMapDocument,
  parseLiveAppMapJson,
} from './parse';
export type { ParseFail, ParseOk, ParseResult } from './parse';

export {
  appMapToLiveAppMap,
  coerceEdgeKind,
  isEdgeKind,
  isNavigationEdgeKind,
  liveAppMapToAppMap,
} from './convert';
