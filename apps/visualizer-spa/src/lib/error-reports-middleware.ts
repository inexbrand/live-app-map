/**
 * POST /api/error-reports — ошибки клиента (ErrorBoundary, window.onerror)
 * пишутся в `<.lam-feedback>/error-reports.jsonl` и в консоль dev-сервера.
 * Почтовой отправки нет: отчёт читают с диска (агент, CLI, человек).
 */
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { resolveLamDir } from '@live-app-map/mcp-server';
import { z } from 'zod';
import { ErrorReportSource, type ErrorReport } from './error-report';
import {
  isLocalOrigin,
  parseJsonText,
  readBody,
  requestPath,
  sendJson,
  type DevMiddleware,
} from './dev-http';

/** Путь эндпоинта. */
export const ERROR_REPORTS_PATH = '/api/error-reports';

/** Имя файла журнала в папке обмена. */
export const ERROR_REPORTS_FILE = 'error-reports.jsonl';

const MAX_BODY_BYTES = 64 * 1024;

/** Схема отчёта (граница: тело POST). */
export const errorReportSchema: z.ZodType<ErrorReport> = z.object({
  source: z.nativeEnum(ErrorReportSource),
  message: z.string().min(1).max(4000),
  stack: z.string().max(20_000).nullable(),
  componentStack: z.string().max(20_000).nullable(),
  url: z.string().max(2000),
  userAgent: z.string().max(1000),
});

/** Настройки middleware. */
export type ErrorReportsOptions = {
  /** Папка обмена (`resolveLamDir`). */
  readonly lamDir: string;
  /** Куда писать строку в консоль (по умолчанию console.error). */
  readonly log?: (line: string) => void;
};

async function handle(
  req: Parameters<DevMiddleware>[0],
  res: Parameters<DevMiddleware>[1],
  options: ErrorReportsOptions,
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'только POST' });
    return;
  }
  if (!isLocalOrigin(req)) {
    sendJson(res, 403, { ok: false, error: 'origin не локальный' });
    return;
  }
  const body = await readBody(req, MAX_BODY_BYTES);
  if (!body.ok) {
    sendJson(res, body.status, { ok: false, error: body.error });
    return;
  }
  const json = parseJsonText(body.text);
  const parsed = errorReportSchema.safeParse(json?.value);
  if (!parsed.success) {
    sendJson(res, 400, { ok: false, error: parsed.error.issues[0]?.message ?? 'неверный отчёт' });
    return;
  }
  const id = randomUUID();
  const record = { id, receivedAt: new Date().toISOString(), ...parsed.data };
  mkdirSync(options.lamDir, { recursive: true });
  appendFileSync(path.join(options.lamDir, ERROR_REPORTS_FILE), `${JSON.stringify(record)}\n`, 'utf8');
  (options.log ?? console.error)(`[lam-error-report] ${parsed.data.source}: ${parsed.data.message}`);
  sendJson(res, 201, { ok: true, id });
}

/**
 * Создаёт middleware отчётов об ошибках.
 *
 * @param options - папка обмена и логгер
 */
export function createErrorReportsMiddleware(options: ErrorReportsOptions): DevMiddleware {
  return (req, res, next) => {
    if (requestPath(req) !== ERROR_REPORTS_PATH) {
      next();
      return;
    }
    void handle(req, res, options).catch((err: unknown) => {
      sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
    });
  };
}

/** Middleware для vite.config: папка обмена в корне монорепо. */
export const errorReportsMiddleware: DevMiddleware = createErrorReportsMiddleware({
  lamDir: resolveLamDir(process.cwd()),
});