import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { createErrorReporter, installGlobalErrorReporting } from './lib/report-client-error';
import { initPluginHost } from './plugin-host';
import './styles/global.css';
import './styles/views.css';

// Production-safe: пустой список плагинов — no-op registry, boot не ломается.
// Реальные visualizer-плагины подключаются сюда, когда host wiring расширят.
initPluginHost([]);

const reportError = createErrorReporter();
installGlobalErrorReporting(reportError);

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('root element missing');
}

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary report={reportError}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);