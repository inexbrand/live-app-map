/**
 * Горячие клавиши оболочки. В полях ввода работают только ⌘K/Ctrl+K и Esc.
 */
import { useEffect } from 'react';
import { useUiStore } from '../store/ui-store';
import { useViewStore, type AppView } from '../store/view-store';
import { isTypingTarget } from './typing-target';
import { toggleTheme } from './theme';

const VIEW_KEYS: ReadonlyMap<string, AppView> = new Map([
  ['1', 'screens'],
  ['2', 'api'],
  ['3', 'database'],
  ['4', 'docs'],
]);

type Ui = ReturnType<typeof useUiStore.getState>;

/** Нажата буква независимо от раскладки и регистра (латиница или кириллица). */
function isLetter(e: KeyboardEvent, latin: string, cyrillic: string): boolean {
  const k = e.key.toLowerCase();
  return k === latin || k === cyrillic;
}

/** ⌘K/Ctrl+K и Esc работают всегда, даже в полях ввода. */
function globalKey(e: KeyboardEvent, ui: Ui): boolean {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    ui.setPalette(!ui.palette);
    return true;
  }
  if (e.key === 'Escape' && (ui.palette || ui.help)) {
    ui.setPalette(false);
    ui.setHelp(false);
    return true;
  }
  return false;
}

/** Клавиши без карты: справка и тема. */
function shellKey(e: KeyboardEvent, ui: Ui): boolean {
  if (e.key === '?') {
    e.preventDefault();
    ui.setHelp(!ui.help);
    return true;
  }
  if (isLetter(e, 't', 'е')) {
    toggleTheme();
    return true;
  }
  return false;
}

/** Клавиши открытой карты: поиск, виды, граф документации. */
function mapKey(e: KeyboardEvent, ui: Ui): void {
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
  if (isLetter(e, 'g', 'п')) {
    const v = useViewStore.getState();
    v.setDocsMode(v.view === 'docs' && v.docsMode === 'graph' ? 'text' : 'graph');
  }
}

/** Буквы и цифры не перехватываются: фокус в поле, модификатор или открыт поиск. */
function ownedByOthers(e: KeyboardEvent, ui: Ui): boolean {
  return isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey || ui.palette;
}

/**
 * Одно нажатие.
 *
 * @param enabled - карта открыта
 */
function onHotkey(e: KeyboardEvent, enabled: boolean): void {
  const ui = useUiStore.getState();
  if (globalKey(e, ui) || ownedByOthers(e, ui) || shellKey(e, ui) || !enabled) {
    return;
  }
  mapKey(e, ui);
}

/**
 * Вешает клавиши на окно.
 *
 * @param enabled - карта открыта (виды и поиск без карты не нужны)
 */
export function useHotkeys(enabled: boolean): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => onHotkey(e, enabled);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}