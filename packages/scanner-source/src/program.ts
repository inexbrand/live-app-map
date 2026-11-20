/**
 * Программа TypeScript только из файлов проекта: внешние пакеты из node_modules
 * не грузятся (скорость), workspace-пакеты разрешаются в исходники.
 */
import ts from 'typescript';

const OPTIONS: ts.CompilerOptions = {
  allowJs: false,
  jsx: ts.JsxEmit.Preserve,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  noLib: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  types: [],
};

/**
 * Создаёт программу; импорт, который ведёт в node_modules, остаётся неразрешённым.
 *
 * @param absFiles - абсолютные пути исходников
 * @returns программа
 */
export function createSourceProgram(absFiles: readonly string[]): ts.Program {
  const host = ts.createCompilerHost(OPTIONS, true);
  host.resolveModuleNameLiterals = (literals, containingFile) =>
    literals.map((lit) => {
      const res = ts.resolveModuleName(lit.text, containingFile, OPTIONS, host).resolvedModule;
      if (res === undefined || res.isExternalLibraryImport === true || res.resolvedFileName.includes('/node_modules/')) {
        return { resolvedModule: undefined };
      }
      return { resolvedModule: res };
    });
  return ts.createProgram({ rootNames: [...absFiles], options: OPTIONS, host });
}
