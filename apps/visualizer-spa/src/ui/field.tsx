/**
 * Поля ввода UI-kit.
 */
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

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
    <div className={`ui-field${inline ? ' ui-field--inline' : ''}${className ? ` ${className}` : ''}`}>
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
export function Input(props: InputProps) {
  const { className, ...rest } = props;
  return <input className={`ui-input${className ? ` ${className}` : ''}`} {...rest} />;
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/**
 * Select.
 */
export function Select(props: SelectProps) {
  const { className, children, ...rest } = props;
  return (
    <select className={`ui-select${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </select>
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * Textarea.
 */
export function Textarea(props: TextareaProps) {
  const { className, ...rest } = props;
  return <textarea className={`ui-textarea${className ? ` ${className}` : ''}`} {...rest} />;
}
