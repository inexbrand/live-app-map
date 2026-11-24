/**
 * Раздел code общей карты: один скан исходников всего проекта на все приложения,
 * чтобы связи экран → роут → таблицы были у каждого экрана.
 */
import { scanDocs } from '@live-app-map/scanner-docs';
import { scanSource } from '@live-app-map/scanner-source';
import type { AppMapDocument, CodeModel, CodeSymbol, Diagnostic, DocsModel, ScreenApi } from '@live-app-map/schema';
import { attachCode, screenEntries } from '../code-scan';

/** Приложение: id (приставка нод в общей карте) и его карта экранов. */
export type SurfaceDoc = {
  readonly id: string;
  readonly doc: AppMapDocument;
};

/** Результат: карты приложений с кодом, code и docs для общей карты. */
export type ProjectCode = {
  readonly maps: ReadonlyMap<string, AppMapDocument>;
  /** code с экранами всех приложений; nodeId — `<приложение>:<id ноды>`. */
  readonly allCode: CodeModel;
  /** Документация репозитория (эпохи, заметки, руководства). */
  readonly docs: DocsModel;
  readonly diagnostics: readonly Diagnostic[];
};

/**
 * Символы для карты. Символы без комментариев — 4/5 веса карты и ничего не объясняют:
 * остаются документированные и символы файлов экранов (панель экрана показывает их).
 *
 * @param symbols - все символы скана
 * @param screens - экраны с файлами
 * @returns отобранные символы
 */
export function keptSymbols(symbols: readonly CodeSymbol[], screens: readonly ScreenApi[]): CodeSymbol[] {
  const screenFiles = new Set(screens.map((s) => s.file));
  return symbols.filter((s) => s.doc !== undefined || s.comments !== undefined || screenFiles.has(s.location.file));
}

/**
 * code приложения: свои экраны (nodeId без приставки) и символы только их файлов.
 *
 * @param code - общий code
 * @param id - id приложения
 * @returns code приложения
 */
export function surfaceCode(code: CodeModel, id: string): CodeModel {
  const prefix = `${id}:`;
  const own = (code.screens ?? [])
    .filter((sc) => sc.nodeId?.startsWith(prefix) === true)
    .map((sc) => ({ ...sc, nodeId: sc.nodeId?.slice(prefix.length) }));
  const files = new Set(own.map((sc) => sc.file));
  return { ...code, symbols: code.symbols.filter((x) => files.has(x.location.file)), screens: own };
}

/**
 * Сканирует исходники проекта один раз и раздаёт раздел code приложениям.
 *
 * @param root - корень проекта
 * @param surfaces - карты экранов приложений
 * @returns карты с кодом, общий code и docs
 */
export function attachProjectCode(root: string, surfaces: readonly SurfaceDoc[]): ProjectCode {
  const entries = surfaces.flatMap((s) => screenEntries(s.doc, root, `${s.id}:`));
  const scan = scanSource({ root, entries });
  const screens = scan.code.screens ?? [];
  const code: CodeModel = { ...scan.code, symbols: keptSymbols(scan.code.symbols, screens) };
  const docs = scanDocs(root);
  const maps = new Map(surfaces.map((s): [string, AppMapDocument] => [s.id, { ...attachCode(s.doc, surfaceCode(code, s.id)), docs }]));
  return { maps, allCode: code, docs, diagnostics: scan.diagnostics };
}
