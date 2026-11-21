/**
 * Программа TypeScript только из файлов проекта: внешние пакеты из node_modules
 * не грузятся (скорость), workspace-пакеты разрешаются в исходники, алиасы путей
 * (`@/…`) — по `paths` ближайшего tsconfig.json.
 */
import path from 'node:path';
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

/** Хост чтения tsconfig без обхода каталогов: нужны только опции, не список файлов. */
const CONFIG_HOST: ts.ParseConfigHost = {
  useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: () => [],
};

/**
 * Опции разрешения модулей каталога: `paths` и `baseUrl` ближайшего tsconfig.json
 * (с учётом `extends`); без алиасов — общие опции.
 */
class PathAliases {
  private readonly byDir = new Map<string, ts.CompilerOptions>();

  optionsFor(file: string): ts.CompilerOptions {
    return this.dirOptions(path.dirname(file));
  }

  private dirOptions(dir: string): ts.CompilerOptions {
    const cached = this.byDir.get(dir);
    if (cached !== undefined) {
      return cached;
    }
    const config = path.join(dir, 'tsconfig.json');
    const parent = path.dirname(dir);
    let opts: ts.CompilerOptions;
    if (ts.sys.fileExists(config)) {
      opts = this.readConfig(config);
    } else if (parent === dir || ts.sys.fileExists(path.join(dir, 'package.json'))) {
      // Корень пакета без tsconfig — алиасов нет, выше не ищем.
      opts = OPTIONS;
    } else {
      opts = this.dirOptions(parent);
    }
    this.byDir.set(dir, opts);
    return opts;
  }

  private readConfig(config: string): ts.CompilerOptions {
    const read = ts.readConfigFile(config, ts.sys.readFile);
    if (read.error !== undefined) {
      return OPTIONS;
    }
    const parsed = ts.parseJsonConfigFileContent(read.config, CONFIG_HOST, path.dirname(config));
    const { paths, baseUrl, pathsBasePath } = parsed.options;
    if (paths === undefined && baseUrl === undefined) {
      return OPTIONS;
    }
    return {
      ...OPTIONS,
      ...(paths === undefined ? {} : { paths }),
      ...(baseUrl === undefined ? {} : { baseUrl }),
      ...(pathsBasePath === undefined ? {} : { pathsBasePath }),
    };
  }
}

/**
 * Создаёт программу; импорт, который ведёт в node_modules, остаётся неразрешённым.
 *
 * @param absFiles - абсолютные пути исходников
 * @returns программа
 */
export function createSourceProgram(absFiles: readonly string[]): ts.Program {
  const host = ts.createCompilerHost(OPTIONS, true);
  const aliases = new PathAliases();
  host.resolveModuleNameLiterals = (literals, containingFile) =>
    literals.map((lit) => {
      const opts = aliases.optionsFor(containingFile);
      const res = ts.resolveModuleName(lit.text, containingFile, opts, host).resolvedModule;
      if (res === undefined || res.isExternalLibraryImport === true || res.resolvedFileName.includes('/node_modules/')) {
        return { resolvedModule: undefined };
      }
      return { resolvedModule: res };
    });
  return ts.createProgram({ rootNames: [...absFiles], options: OPTIONS, host });
}
