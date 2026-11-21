/**
 * Тема интерфейса: тёмная или светлая. Выбор живёт в localStorage и в атрибуте
 * `data-theme` корня — токены цвета в global.css переключаются по нему.
 */

/** Тема. */
export type Theme = 'dark' | 'light';

const KEY = 'lam-theme';

/** Сохранённая тема; по умолчанию тёмная (основная тема инструмента). */
export function savedTheme(): Theme {
  return window.localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
}

/** Применить тему к документу и запомнить. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme;
  window.localStorage.setItem(KEY, theme);
}

/** Текущая тема документа. */
export function currentTheme(): Theme {
  return document.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark';
}

/** Переключить тему; возвращает новую. */
export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === 'light' ? 'dark' : 'light';
  applyTheme(next);
  return next;
}
