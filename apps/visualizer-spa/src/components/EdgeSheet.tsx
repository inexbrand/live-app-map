/**
 * Край экрана: модальная панель (лист) поверх карты.
 */
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../ui';

export type EdgeSheetSide = 'left' | 'right' | 'top' | 'bottom' | 'center';

export type EdgeSheetProps = {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly side?: EdgeSheetSide;
  readonly onClose: () => void;
  readonly children: ReactNode;
};

/**
 * Модалка у края / по центру с затемнением.
 */
export function EdgeSheet(props: EdgeSheetProps) {
  const { open, title, description, side = 'center', onClose, children } = props;
  if (!open) {
    return null;
  }

  return (
    <div className="edge-sheet-root" role="presentation">
      <button
        type="button"
        className="edge-sheet-backdrop"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <aside
        className={`edge-sheet edge-sheet--${side}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="edge-sheet__header">
          <div>
            <h2 className="edge-sheet__title">{title}</h2>
            {description ? (
              <p className="edge-sheet__desc">{description}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Закрыть панель"
          >
            <X size={16} strokeWidth={1.75} />
          </Button>
        </header>
        <div className="edge-sheet__body">{children}</div>
      </aside>
    </div>
  );
}
