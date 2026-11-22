/**
 * Кнопка темы шапки; следит за атрибутом корня — тема меняется и клавишей T.
 */
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { currentTheme, toggleTheme, type Theme } from '../../lib/theme';
import { ToolbarButton } from './ToolbarButton';

/** Переключатель светлой и тёмной темы. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(currentTheme()));
    mo.observe(window.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  const light = theme === 'light';
  return (
    <ToolbarButton
      icon={light ? Moon : Sun}
      size="icon-sm"
      onClick={() => toggleTheme()}
      aria-label={light ? 'Тёмная тема' : 'Светлая тема'}
      title={light ? 'Тёмная тема (T)' : 'Светлая тема (T)'}
      data-testid="theme-toggle"
    />
  );
}
