/**
 * Кнопка шапки: иконка, подпись, выбранное состояние — общий вид вкладок, листов, поиска и темы.
 */
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, type ButtonProps } from '../../ui';

/** Props кнопки шапки. */
export type ToolbarButtonProps = Omit<ButtonProps, 'children' | 'variant' | 'size' | 'type'> & {
  readonly icon: LucideIcon;
  /** Выбрана (вкладка открыта, лист раскрыт): основной цвет вместо контура. */
  readonly selected?: boolean;
  readonly label?: string;
  /** Подпись прячется на узкой шапке (`toolbar__label`); false — подпись всегда видна. */
  readonly labelCollapses?: boolean;
  readonly size?: 'sm' | 'icon-sm';
  /** После подписи: счётчик, клавиша. */
  readonly children?: ReactNode;
};

/**
 * Кнопка шапки.
 *
 * @param props - иконка, подпись, выбранность и обычные props кнопки
 */
export function ToolbarButton(props: ToolbarButtonProps) {
  const { icon: Icon, selected = false, label, labelCollapses = true, size = 'sm', children, ...rest } = props;
  return (
    <Button type="button" size={size} variant={selected ? 'primary' : 'outline'} {...rest}>
      <Icon size={16} strokeWidth={1.75} />
      {label === undefined ? null : labelCollapses ? <span className="toolbar__label">{label}</span> : label}
      {children}
    </Button>
  );
}
