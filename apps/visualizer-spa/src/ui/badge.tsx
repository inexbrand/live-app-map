/**
 * Badge / Chip UI-kit.
 */
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  readonly children?: ReactNode;
};

/**
 * Статичный badge.
 */
export function Badge(props: BadgeProps) {
  const { className, children, ...rest } = props;
  return (
    <span className={`ui-badge${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </span>
  );
}

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly active?: boolean;
};

/**
 * Кликабельный chip (стейты / роли).
 */
export function Chip(props: ChipProps) {
  const { active = false, className, type = 'button', children, ...rest } = props;
  return (
    <button
      type={type}
      className={`ui-chip${active ? ' ui-chip--active' : ''}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}
