/**
 * Кнопка UI-kit (shadcn-like, monochrome).
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'outline';
export type ButtonSize = 'default' | 'sm' | 'icon' | 'icon-sm';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly active?: boolean;
  readonly children?: ReactNode;
};

function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * Универсальная кнопка.
 */
export function Button(props: ButtonProps) {
  const {
    variant = 'default',
    size = 'default',
    active = false,
    className,
    type = 'button',
    children,
    ...rest
  } = props;

  return (
    <button
      type={type}
      className={classNames(
        'ui-btn',
        variant === 'primary' && 'ui-btn--primary',
        variant === 'ghost' && 'ui-btn--ghost',
        variant === 'outline' && 'ui-btn--outline',
        size === 'sm' && 'ui-btn--sm',
        size === 'icon' && 'ui-btn--icon',
        size === 'icon-sm' && 'ui-btn--icon ui-btn--sm',
        active && 'ui-btn--active',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
