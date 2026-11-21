/**
 * Горячие клавиши оболочки. В полях ввода работают только ⌘K/Ctrl+K и Esc.
 */
import { useEffect } from 'react';
import { useUiStore } from '../store/ui-store';
import { useViewStore, type AppView } from '../store/view-store';
import { toggleTheme } from './theme';

const VIEW_KEYS: ReadonlyMap<string, AppView> = new Map([
  ['1', 'screens'],
  ['2', 'api'],
  ['3', 'database'],
  ['4', 'docs'],
]);

/** Фокус в поле ввода: буквы и цифры принадлежат полю. */
function typing(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);
}

/**
 * Вешает клавиши на окно.
 *
 * @param enabled - карта открыта (виды и поиск без карты не нужны)
 */
export function useHotkeys(enabled: boolean): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const ui = useUiStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.setPalette(!ui.palette);
        return;
      }
      if (e.key === 'Escape' && (ui.palette || ui.help)) {
        ui.setPalette(false);
        ui.setHelp(false);
        return;
      }
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey || ui.palette) {
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        ui.setHelp(!ui.help);
        return;
      }
      if (e.key === 't' || e.key === 'T' || e.key === 'е' || e.key === 'Е') {
        toggleTheme();
        return;
      }
      if (!enabled) {
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        ui.setPalette(true);
        return;
      }
      const view = VIEW_KEYS.get(e.key);
      if (view !== undefined) {
        useViewStore.getState().setView(view);
        return;
      }
      if (e.key === 'g' || e.key === 'G' || e.key === 'п' || e.key === 'П') {
        const v = useViewStore.getState();
        v.setDocsMode(v.view === 'docs' && v.docsMode === 'graph' ? 'text' : 'graph');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
