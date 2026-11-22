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
  endpointMiddleware,
  isLocalOrigin,
  readValidJson,
  rejectMethod,
  sendError,
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
  // Метод проверяется раньше origin: GET с чужой страницы — 405, как и прежде.
  if (req.method !== 'POST') {
    rejectMethod(res, 'POST', 'только POST');
    return;
  }
  if (!isLocalOrigin(req)) {
    sendError(res, 403, 'origin не локальный');
    return;
  }
  const report = await readValidJson(req, res, errorReportSchema, MAX_BODY_BYTES, (issues) => issues[0]?.message ?? 'неверный отчёт');
  if (report === null) {
    return;
  }
  const id = randomUUID();
  const record = { id, receivedAt: new Date().toISOString(), ...report };
  mkdirSync(options.lamDir, { recursive: true });
  appendFileSync(path.join(options.lamDir, ERROR_REPORTS_FILE), `${JSON.stringify(record)}\n`, 'utf8');
  (options.log ?? console.error)(`[lam-error-report] ${report.source}: ${report.message}`);
  sendJson(res, 201, { ok: true, id });
}

/**
 * Создаёт middleware отчётов об ошибках.
 *
 * @param options - папка обмена и логгер
 */
export function createErrorReportsMiddleware(options: ErrorReportsOptions): DevMiddleware {
  return endpointMiddleware({
    matches: (p) => p === ERROR_REPORTS_PATH,
    errorStatus: 500,
    handle: (req, res) => handle(req, res, options),
  });
}

/** Middleware для vite.config: папка обмена в корне монорепо. */
export const errorReportsMiddleware: DevMiddleware = createErrorReportsMiddleware({
  lamDir: resolveLamDir(process.cwd()),
});