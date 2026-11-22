/**
 * Клиентские ошибки → POST /api/error-reports (dev-сервер пишет их в
 * .lam-feedback/error-reports.jsonl). Одна и та же ошибка отправляется
 * один раз за загрузку страницы, всего не больше MAX_REPORTS_PER_PAGE.
 */
import { requestOk } from './dev-api';
import { ErrorReportSource, type ErrorReport } from './error-report';

/** Путь эндпоинта (совпадает с ERROR_REPORTS_PATH, без импорта Node-модуля). */
export const CLIENT_ERROR_REPORTS_URL = '/api/error-reports';

/** Предел отчётов с одной страницы (защита от цикла ошибок). */
export const MAX_REPORTS_PER_PAGE = 20;

/** Сырые данные ошибки. */
export type ClientErrorInput = {
  readonly source: ErrorReportSource;
  readonly error: unknown;
  readonly componentStack?: string | null;
};

/**
 * Отчёт из любой брошенной сущности (Error, строка, объект).
 *
 * @param input - источник и ошибка
 * @param location - адрес страницы
 * @param userAgent - браузер
 */
export function buildErrorReport(
  input: ClientErrorInput,
  location: string,
  userAgent: string,
): ErrorReport {
  const err = input.error;
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return {
    source: input.source,
    message: message.slice(0, 4000) || 'пустая ошибка',
    stack: err instanceof Error && err.stack !== undefined ? err.stack.slice(0, 20_000) : null,
    componentStack: input.componentStack?.slice(0, 20_000) ?? null,
    url: location.slice(0, 2000),
    userAgent: userAgent.slice(0, 1000),
  };
}

/**
 * Отправитель с дедупликацией по message+stack.
 *
 * @param fetchFn - fetch (подменяется в тестах)
 */
export function createErrorReporter(fetchFn: typeof fetch = fetch): (report: ErrorReport) => Promise<boolean> {
  const seen = new Set<string>();
  return async (report) => {
    const key = `${report.message}\n${report.stack ?? ''}`;
    if (seen.has(key) || seen.size >= MAX_REPORTS_PER_PAGE) {
      return false;
    }
    seen.add(key);
    return requestOk(CLIENT_ERROR_REPORTS_URL, { method: 'POST', json: report, fetchFn });
  };
}
/**
 * Подключает window.onerror и unhandledrejection к отправителю.
 *
 * @param report - отправитель (createErrorReporter)
 * @returns отписка
 */
export function installGlobalErrorReporting(
  report: (r: ErrorReport) => Promise<boolean>,
): () => void {
  const send = (source: ErrorReportSource, error: unknown): void => {
    void report(buildErrorReport({ source, error }, window.location.href, navigator.userAgent));
  };
  const onError = (e: ErrorEvent): void => send(ErrorReportSource.WINDOW, e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent): void => send(ErrorReportSource.REJECTION, e.reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}