/**
 * Panel / card UI-kit.
 */
import type { HTMLAttributes, ReactNode } from 'react';

export type PanelProps = HTMLAttributes<HTMLElement> & {
  readonly as?: 'div' | 'aside' | 'section';
  readonly children?: ReactNode;
};

/**
 * Карточка / drawer shell.
 */
export function Panel(props: PanelProps) {
  const { as: Tag = 'div', className, children, ...rest } = props;
  return (
    <Tag className={`ui-panel${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </Tag>
  );
}

export type PanelHeaderProps = {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
};

/**
 * Заголовок панели.
 */
export function PanelHeader(props: PanelHeaderProps) {
  return (
    <div className="ui-panel__header">
      <div>
        <h2 className="ui-panel__title">{props.title}</h2>
        {props.description ? (
          <p className="ui-panel__desc">{props.description}</p>
        ) : null}
      </div>
      {props.action}
    </div>
  );
}

/**
 * Тело панели.
 */
export function PanelBody(props: { readonly children?: ReactNode; readonly className?: string }) {
  return (
    <div className={`ui-panel__body${props.className ? ` ${props.className}` : ''}`}>
      {props.children}
    </div>
  );
}
