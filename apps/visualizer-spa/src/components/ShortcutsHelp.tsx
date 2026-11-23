/**
 * Справка по горячим клавишам (клавиша ?).
 */
import { X } from 'lucide-react';
import { useUiStore } from '../store/ui-store';
import { Button } from '@/components/ui/button';

/** Клавиши и что они делают. */
export const SHORTCUTS: readonly { readonly keys: readonly string[]; readonly what: string }[] = [
  { keys: ['⌘ K', 'Ctrl K', '/'], what: 'Поиск по экранам, роутам, таблицам, эпохам, документам и файлам' },
  { keys: ['1'], what: 'Экраны' },
  { keys: ['2'], what: 'API' },
  { keys: ['3'], what: 'База данных' },
  { keys: ['4'], what: 'Документация' },
  { keys: ['G'], what: 'Документация: текст ⇄ граф' },
  { keys: ['Alt ←', 'Alt →'], what: 'Назад и вперёд по истории переходов' },
  { keys: ['T'], what: 'Светлая или тёмная тема' },
  { keys: ['Esc'], what: 'Закрыть окно, панель или подсказку' },
  { keys: ['?'], what: 'Эта справка' },
];

/** Справка. */
export function ShortcutsHelp() {
  const open = useUiStore((s) => s.help);
  const setHelp = useUiStore((s) => s.setHelp);
  if (!open) {
    return null;
  }
  return (
    <div className="palette-backdrop" onMouseDown={() => setHelp(false)}>
      <div className="palette help" role="dialog" aria-modal="true" aria-label="Горячие клавиши" data-testid="shortcuts-help" onMouseDown={(e) => e.stopPropagation()}>
        <div className="help__head">
          <h2>Горячие клавиши</h2>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Закрыть" onClick={() => setHelp(false)}>
            <X size={16} />
          </Button>
        </div>
        <dl className="help__list">
          {SHORTCUTS.map((s) => (
            <div key={s.what} className="help__row">
              <dt>
                {s.keys.map((k) => (
                  <kbd key={k} className="palette__kbd">
                    {k}
                  </kbd>
                ))}
              </dt>
              <dd>{s.what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}