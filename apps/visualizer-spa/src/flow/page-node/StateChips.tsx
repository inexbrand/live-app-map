/**
 * Стейты экрана чипами: выбранный подставляется в live URL.
 */
import type { AppMapPageState } from '@live-app-map/schema';
import { Toggle } from '@/components/ui/toggle';

/** Props стейтов. */
export type StateChipsProps = {
  readonly states: readonly AppMapPageState[];
  readonly activeStateName: string | undefined;
  readonly onState: (st: AppMapPageState) => void;
};

/**
 * Стейты экрана.
 *
 * @param props - стейты, активный и переключение
 */
export function StateChips(props: StateChipsProps) {
  const { states, activeStateName, onState } = props;
  return (
    <div className="page-node__states">
      {states.map((st) => (
        <Toggle variant="outline" size="sm"
          key={st.name}
          pressed={activeStateName === st.name}
          title={st.note ?? st.name}
          onClick={(e) => {
            e.stopPropagation();
            onState(st);
          }}
        >
          {st.name === 'recruiter'
            ? 'рекрутер'
            : st.name === 'employer'
              ? 'клиент'
              : st.name}
        </Toggle>
      ))}
    </div>
  );
}