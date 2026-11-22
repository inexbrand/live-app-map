/**
 * Выбор лимита iframe: число из списка или «без лимита» (9999).
 */
import { Field, Select } from '../../ui';

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

/**
 * Поле лимита.
 *
 * @param props - подписи, значение и варианты
 */
export function BudgetField(props: BudgetFieldProps) {
  const { id, label, hint, value, onChange, counts, zeroLabel, unlimitedLabel } = props;
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <Select id={id} value={value >= UNLIMITED ? UNLIMITED : value} onChange={(e) => onChange(Number(e.target.value))}>
        {counts.map((n) => (
          <option key={n} value={n}>
            {n === 0 && zeroLabel !== undefined ? zeroLabel : n}
            {n === DEFAULT_COUNT ? ' (по умолчанию)' : ''}
          </option>
        ))}
        <option value={UNLIMITED}>{unlimitedLabel}</option>
      </Select>
    </Field>
  );
}
