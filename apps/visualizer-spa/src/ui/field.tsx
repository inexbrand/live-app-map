/**
 * Поля ввода UI-kit.
 */
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { classed } from './classed';
import { cx } from './class-names';

export type FieldProps = {
  readonly label?: string;
  readonly htmlFor?: string;
  readonly hint?: string;
  readonly inline?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
};

/**
 * Обёртка label + control.
 */
export function Field(props: FieldProps) {
  const { label, htmlFor, hint, inline = false, children, className } = props;
  return (
    <div className={cx('ui-field', inline && 'ui-field--inline', className)}>
      {label ? (
        <label className="ui-field__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {hint ? <span className="drawer__hint">{hint}</span> : null}
    </div>
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Текстовый input.
 */
export const Input = classed('input', 'ui-input', 'Input');

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/**
 * Select.
 */
export const Select = classed('select', 'ui-select', 'Select');

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * Textarea.
 */
export const Textarea = classed('textarea', 'ui-textarea', 'Textarea');
