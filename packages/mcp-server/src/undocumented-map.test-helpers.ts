/**
 * Копия среза карты, где у каждого пятого роута снято авторское описание (doc и comments).
 * В срезе korbor-all описаны все роуты (2026-11-25), а describe_api undocumented и описание
 * из кода проверяются на роутах без него — как роут без комментария над обработчиком.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type RouteDocs = { readonly doc?: string; readonly comments?: readonly string[] };
type MapWithRoutes = { readonly code?: { readonly routes: readonly RouteDocs[] } };

/**
 * Пишет копию карты с роутами без описания.
 *
 * @param source - файл карты (liveappmap)
 * @param dir - куда положить копию
 * @returns путь копии и число роутов без авторского описания
 */
export function mapWithUndocumentedRoutes(source: string, dir: string): { readonly file: string; readonly undocumented: number } {
  const map = JSON.parse(readFileSync(source, 'utf8')) as MapWithRoutes;
  if (map.code === undefined) {
    throw new Error(`в карте ${source} нет раздела code`);
  }
  const routes = map.code.routes.map((r, i): RouteDocs => {
    if (i % 5 !== 0) {
      return r;
    }
    const { doc: _doc, comments: _comments, ...bare } = r;
    return bare;
  });
  const undocumented = routes.filter((r) => r.doc === undefined && (r.comments === undefined || r.comments.length === 0)).length;
  const file = path.join(dir, `undocumented-${path.basename(source)}`);
  writeFileSync(file, JSON.stringify({ ...map, code: { ...map.code, routes } }));
  return { file, undocumented };
}
