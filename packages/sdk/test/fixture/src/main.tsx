import { createRoot } from 'react-dom/client';
import { App } from './App';

const el = document.getElementById('root');
if (el === null) {
  throw new Error('нет #root');
}
createRoot(el).render(<App />);
