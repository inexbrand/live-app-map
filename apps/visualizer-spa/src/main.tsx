import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initPluginHost } from './plugin-host';
import './styles/global.css';

// Production-safe: пустой список плагинов — no-op registry, boot не ломается.
// Реальные visualizer-плагины подключаются сюда, когда host wiring расширят.
initPluginHost([]);

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('root element missing');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
