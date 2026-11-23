/**
 * Выбор лимита iframe: число из списка или «без лимита» (9999).
 */
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { OptionSelect } from '../option-select';

/** Значение «без лимита» в store. */
const UNLIMITED = 9999;

/** Число по умолчанию: помечается в списке. */
const DEFAULT_COUNT = 8;

/** Props поля лимита. */
export type BudgetFieldProps = {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly value: number;
  readonly onChange: (n: number) => void;
  readonly counts: readonly number[];
  /** Подпись нуля, если 0 есть в списке. */
  readonly zeroLabel?: string;
  readonly unlimitedLabel: string;
};

/** Подпись числа в списке. */
function countLabel(n: number, zeroLabel: string | undefined): string {
  const base = n === 0 && zeroLabel !== undefined ? zeroLabel : String(n);
  return n === DEFAULT_COUNT ? `${base} (по умолчанию)` : base;
}

/**
 * Поле лимита.
 *
 * @param props - подписи, значение и варианты
 */
export function BudgetField(props: BudgetFieldProps) {
  const { id, label, hint, value, onChange, counts, zeroLabel, unlimitedLabel } = props;
  const items = [...counts.map((n) => ({ value: String(n), label: countLabel(n, zeroLabel) })), { value: String(UNLIMITED), label: unlimitedLabel }];
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <OptionSelect id={id} aria-label={label} items={items} value={String(value >= UNLIMITED ? UNLIMITED : value)} onValueChange={(v) => onChange(Number(v))} />
      <FieldDescription>{hint}</FieldDescription>
    </Field>
  );
}
