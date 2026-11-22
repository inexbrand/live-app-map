/**
 * Тонкая обёртка тега UI-kit: базовый класс плюс className снаружи, остальные props как есть.
 */
import { createElement, type ComponentPropsWithoutRef, type ReactElement } from 'react';
import { cx } from './class-names';

/** Теги, у которых в UI-kit есть обёртка с базовым классом. */
type ClassedTag = 'input' | 'select' | 'textarea' | 'span';

/** Компонент-обёртка тега. */
export type ClassedComponent<E extends ClassedTag> = ((props: ComponentPropsWithoutRef<E>) => ReactElement) & {
  displayName: string;
};

/**
 * Компонент тега с базовым классом.
 *
 * @param tag - тег
 * @param base - базовый класс, например `ui-input`
 * @param displayName - имя компонента (видно в выборе компонента для замечаний)
 */
export function classed<E extends ClassedTag>(tag: E, base: string, displayName: string): ClassedComponent<E> {
  const component = (props: ComponentPropsWithoutRef<E>): ReactElement => {
    const { className, ...rest } = props;
    return createElement(tag, { className: cx(base, className), ...rest });
  };
  return Object.assign(component, { displayName });
}
