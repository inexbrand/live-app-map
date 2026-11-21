/**
 * Раздел code для карт Korbor: один скан исходников всего репозитория на все
 * поверхности сразу (miniapp, admin, site), чтобы связи экран → роут → таблицы
 * были в каждой карте и в общей «Весь Korbor».
 */
import { scanSource } from '../packages/scanner-source/src/index';
import { attachCode, screenEntries } from '../packages/cli/src/index';
import type { AppMapDocument, CodeModel } from '../packages/schema/src/index';

/** Поверхность: id (приставка нод в общей карте) и её карта экранов. */
export type KorborSurfaceDoc = {
  readonly id: string;
  readonly doc: AppMapDocument;
};

/** Результат: карты поверхностей с кодом и code для общей карты. */
export type KorborCode = {
  readonly docs: ReadonlyMap<string, AppMapDocument>;
  /** code с экранами всех поверхностей; nodeId — `<поверхность>:<id ноды>`. */
  readonly allCode: CodeModel;
};

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
  // Символы без комментариев — 4/5 веса карты и ничего не объясняют: оставляем
  // документированные и символы файлов экранов (панель экрана показывает их).
  const screenFiles = new Set(screens.map((s) => s.file));
  const symbols = scan.code.symbols.filter(
    (s) => s.doc !== undefined || s.comments !== undefined || screenFiles.has(s.location.file),
  );
  const code: CodeModel = { ...scan.code, symbols };
  const docs = new Map<string, AppMapDocument>();
  for (const s of surfaces) {
    const prefix = `${s.id}:`;
    const own = screens
      .filter((sc) => sc.nodeId?.startsWith(prefix) === true)
      .map((sc) => ({ ...sc, nodeId: sc.nodeId?.slice(prefix.length) }));
    // Карта поверхности несёт символы только своих экранов; полный набор — в общей карте.
    const files = new Set(own.map((sc) => sc.file));
    const ownSymbols = code.symbols.filter((x) => files.has(x.location.file));
    docs.set(s.id, attachCode(s.doc, { ...code, symbols: ownSymbols, screens: own }));
  }
  const linked = screens.filter((s) => s.calls.length > 0).length;
  console.log(
    `code: symbols=${symbols.length}/${scan.code.symbols.length} routes=${scan.code.routes.length} tables=${scan.code.tables.length} apiCalls=${scan.code.apiCalls?.length ?? 0} screens=${screens.length} linked=${linked} (${Date.now() - t0} ms)`,
  );
  return { docs, allCode: code };
}
