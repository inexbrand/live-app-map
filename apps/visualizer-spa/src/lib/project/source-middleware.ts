/**
 * `GET /__lam_project/source?file=&line=`: объявление из файла проекта —
 * для вкладки «Схема в коде». Файл только внутри корня проекта.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { endpointMiddleware, sendError, sendJson, type DevMiddleware } from '../dev-http';
import { PROJECT_SOURCE_PATH, type SourceSnippet } from './source-contract';
import { statementAt } from './source-statement';

const querySchema = z.object({ file: z.string().min(1), line: z.coerce.number().int().positive() });

/**
 * Middleware исходника.
 *
 * @param projectRoot - корень открытого проекта или null
 * @returns connect-middleware
 */
export function sourceMiddleware(projectRoot: string | null): DevMiddleware {
  return endpointMiddleware({
    matches: (p) => p === PROJECT_SOURCE_PATH,
    errorStatus: 500,
    handle: async (req, res) => {
      if (projectRoot === null) {
        sendError(res, 404, 'проект не открыт: запустите bun run dev -- --project <каталог>');
        return;
      }
      const url = new URL(req.url ?? '/', 'http://local');
      const q = querySchema.safeParse(Object.fromEntries(url.searchParams));
      if (!q.success) {
        sendError(res, 400, 'нужны параметры file (путь от корня проекта) и line (номер строки с 1)');
        return;
      }
      const abs = path.resolve(projectRoot, q.data.file);
      const rel = path.relative(projectRoot, abs);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        sendError(res, 400, `${q.data.file}: файл вне проекта`);
        return;
      }
      if (!existsSync(abs)) {
        sendError(res, 404, `${q.data.file}: файла нет — пересканируйте проект`);
        return;
      }
      const st = statementAt(readFileSync(abs, 'utf8'), q.data.line);
      if (st === null) {
        sendError(res, 404, `${q.data.file}:${q.data.line}: объявления на этой строке нет — пересканируйте проект`);
        return;
      }
      const body: SourceSnippet = { file: q.data.file, ...st };
      sendJson(res, 200, body);
    },
  });
}
