/**
 * Граница ошибок shell: падение рендера не оставляет белый экран, а
 * показывает текст ошибки и отправляет отчёт на dev-сервер.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorReportSource, type ErrorReport } from '../lib/error-report';
import { buildErrorReport } from '../lib/report-client-error';

/** Props границы. */
export type ErrorBoundaryProps = {
  readonly children: ReactNode;
  /** Отправитель отчёта (createErrorReporter). */
  readonly report: (r: ErrorReport) => Promise<boolean>;
};

type State = { readonly error: Error | null };

/**
 * Граница ошибок рендера (классовый компонент — так требует React).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    void this.props.report(
      buildErrorReport(
        { source: ErrorReportSource.BOUNDARY, error, componentStack: info.componentStack ?? null },
        window.location.href,
        navigator.userAgent,
      ),
    );
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }
    return (
      <div className="empty-state" role="alert">
        <div className="empty-state__card">
          <h1>Визуализатор упал</h1>
          <p className="font-mono" style={{ wordBreak: 'break-word' }}>
            {error.name}: {error.message}
          </p>
          <p className="drawer__hint">
            Отчёт сохранён в .lam-feedback/error-reports.jsonl (при запущенном bun run dev).
          </p>
          <div className="empty-state__actions">
            <button type="button" className="ui-btn ui-btn--primary" onClick={() => window.location.reload()}>
              Перезагрузить
            </button>
          </div>
        </div>
      </div>
    );
  }
}
