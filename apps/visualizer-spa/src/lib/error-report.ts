/**
 * Отчёт об ошибке клиента — общий тип браузера и dev-сервера
 * (без Node- и zod-зависимостей, чтобы не тянуть их в бандл).
 */

/** Откуда пришла ошибка. */
export enum ErrorReportSource {
  BOUNDARY = 'boundary',
  WINDOW = 'window',
  REJECTION = 'unhandledrejection',
}

/** Отчёт об ошибке клиента. */
export type ErrorReport = {
  readonly source: ErrorReportSource;
  readonly message: string;
  readonly stack: string | null;
  readonly componentStack: string | null;
  readonly url: string;
  readonly userAgent: string;
};
