/**
 * Badge / Chip UI-kit.
 */
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { classed } from './classed';
import { cx } from './class-names';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  readonly children?: ReactNode;
};

/**
 * Статичный badge.
 */
export const Badge = classed('span', 'ui-badge', 'Badge');

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
      className={cx('ui-chip', active && 'ui-chip--active', className)}
      {...rest}
    >
      {children}
    </button>
  );
}
