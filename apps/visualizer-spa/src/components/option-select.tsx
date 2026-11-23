/**
 * Выбор одного значения из списка — композиция shadcn Select (Base UI) для всех списков визуализатора.
 */
import { Select, SelectContent, SelectGroup, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** Пункт списка. */
export type OptionItem = {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
};

/** Props списка выбора. */
export type OptionSelectProps = {
  readonly items: readonly OptionItem[];
  /** Пункты-действия под чертой (открыть файл, очистить). */
  readonly actions?: readonly OptionItem[];
  /** Пустая строка — ничего не выбрано (видна подсказка placeholder). */
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly id?: string;
  readonly 'aria-label'?: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly size?: 'sm' | 'default';
  readonly 'data-testid'?: string;
};

/**
 * Список выбора: подпись выбранного пункта в кнопке, пункты во всплывающем меню.
 *
 * @param props - пункты, значение и обработчик выбора
 */
export function OptionSelect(props: OptionSelectProps) {
  const { items, actions = [], value, onValueChange, placeholder, size = 'default', className } = props;
  const all = [...items, ...actions];
  return (
    <Select
      items={all.map((i) => ({ value: i.value, label: i.label }))}
      value={value === '' ? null : value}
      disabled={props.disabled}
      onValueChange={(next) => {
        if (typeof next === 'string') {
          onValueChange(next);
        }
      }}
    >
      <SelectTrigger id={props.id} size={size} aria-label={props['aria-label']} data-testid={props['data-testid']} data-value={value} className={cn('w-full min-w-0', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value} disabled={i.disabled}>
              {i.label}
            </SelectItem>
          ))}
        </SelectGroup>
        {actions.length > 0 ? <SelectSeparator /> : null}
        {actions.length > 0 ? (
          <SelectGroup>
            {actions.map((i) => (
              <SelectItem key={i.value} value={i.value} disabled={i.disabled}>
                {i.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ) : null}
      </SelectContent>
    </Select>
  );
}