/**
 * Пути между картой экранов и разделом `code`.
 */

/**
 * Путь файла ноды экрана от корня скана исходников (POSIX).
 *
 * @param projectRoot - project.root карты (каталог приложения)
 * @param codeRoot - code.root (каталог скана исходников)
 * @param sourceFile - source.file ноды (от project.root)
 * @returns путь от code.root или null, если приложение вне каталога скана
 */
export function codeFileOfNode(projectRoot: string, codeRoot: string, sourceFile: string): string | null {
  const app = projectRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  const code = codeRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  if (app === code) {
    return sourceFile;
  }
  if (!app.startsWith(`${code}/`)) {
    return null;
  }
  return `${app.slice(code.length + 1)}/${sourceFile}`;
}
