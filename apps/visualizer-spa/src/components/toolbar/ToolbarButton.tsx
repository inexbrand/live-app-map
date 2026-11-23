/**
 * Кнопка шапки на shadcn Button: иконка, подпись, выбранное состояние.
 */
import type { LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/** Props кнопки шапки. */
export type ToolbarButtonProps = Omit<ComponentProps<typeof Button>, 'children' | 'variant' | 'size'> & {
  readonly icon: LucideIcon;
  /** Выбрана (вкладка открыта, лист раскрыт): заливка вместо контура. */
  readonly selected?: boolean;
  readonly label?: string;
  /** Подпись прячется на узкой шапке; false — подпись всегда видна. */
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
    <Button size={size} variant={selected ? 'default' : 'outline'} {...rest}>
      <Icon strokeWidth={1.75} />
      {label === undefined ? null : <span className={labelCollapses ? 'max-[900px]:hidden' : undefined}>{label}</span>}
      {children}
    </Button>
  );
}
