/**
 * Раздел code для карт Korbor: один скан исходников всего репозитория на все
 * поверхности сразу (miniapp, admin, site), чтобы связи экран → роут → таблицы
 * были в каждой карте и в общей «Весь Korbor».
 */
import { scanSource } from '../packages/scanner-source/src/index';
import { attachCode, screenEntries } from '../packages/cli/src/index';
import { scanDocs } from '../packages/scanner-docs/src/index';
import type { AppMapDocument, CodeModel, CodeSymbol, DocsModel, ScreenApi } from '../packages/schema/src/index';

/** Поверхность: id (приставка нод в общей карте) и её карта экранов. */
export type KorborSurfaceDoc = {
  readonly id: string;
  readonly doc: AppMapDocument;
};

/** Результат: карты поверхностей с кодом и code для общей карты. */
export type KorborCode = {
  readonly maps: ReadonlyMap<string, AppMapDocument>;
  /** code с экранами всех поверхностей; nodeId — `<поверхность>:<id ноды>`. */
  readonly allCode: CodeModel;
  /** Документация репозитория (эпохи, заметки, руководства) — общая для всех карт. */
  readonly docs: DocsModel;
};

/**
 * Символы для карты. Символы без комментариев — 4/5 веса карты и ничего не объясняют:
 * остаются документированные и символы файлов экранов (панель экрана показывает их).
 */
function keptSymbols(symbols: readonly CodeSymbol[], screens: readonly ScreenApi[]): CodeSymbol[] {
  const screenFiles = new Set(screens.map((s) => s.file));
  return symbols.filter((s) => s.doc !== undefined || s.comments !== undefined || screenFiles.has(s.location.file));
}

/** code поверхности: свои экраны (nodeId без приставки) и символы только их файлов; полный набор — в общей карте. */
function surfaceCode(code: CodeModel, id: string): CodeModel {
  const prefix = `${id}:`;
  const own = (code.screens ?? [])
    .filter((sc) => sc.nodeId?.startsWith(prefix) === true)
    .map((sc) => ({ ...sc, nodeId: sc.nodeId?.slice(prefix.length) }));
  const files = new Set(own.map((sc) => sc.file));
  return { ...code, symbols: code.symbols.filter((x) => files.has(x.location.file)), screens: own };
}

/**
 * Сканирует исходники один раз и раздаёт раздел code поверхностям.
 *
 * @param root - корень репозитория Korbor
 * @param surfaces - карты экранов поверхностей
 * @returns карты с кодом и общий code
 */
export function attachKorborCode(root: string, surfaces: readonly KorborSurfaceDoc[]): KorborCode {
  const entries = surfaces.flatMap((s) => screenEntries(s.doc, root, `${s.id}:`));
  const t0 = Date.now();
  const scan = scanSource({ root, entries });
  for (const d of scan.diagnostics) {
    console.log(`[${d.severity}] ${d.code}: ${d.message}`);
  }
  const screens = scan.code.screens ?? [];
  const symbols = keptSymbols(scan.code.symbols, screens);
  const code: CodeModel = { ...scan.code, symbols };
  const projectDocs = scanDocs(root);
  console.log(`docs: epochs=${projectDocs.epochs.length} notes=${projectDocs.notes.length} guides=${projectDocs.guides.length}`);
  const maps = new Map(surfaces.map((s): [string, AppMapDocument] => [s.id, { ...attachCode(s.doc, surfaceCode(code, s.id)), docs: projectDocs }]));
  const linked = screens.filter((s) => s.calls.length > 0).length;
  console.log(
    `code: symbols=${symbols.length}/${scan.code.symbols.length} routes=${scan.code.routes.length} tables=${scan.code.tables.length} apiCalls=${scan.code.apiCalls?.length ?? 0} screens=${screens.length} linked=${linked} (${Date.now() - t0} ms)`,
  );
  return { maps, allCode: code, docs: projectDocs };
}