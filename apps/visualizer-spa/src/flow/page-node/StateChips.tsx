/**
 * Стейты экрана чипами: выбранный подставляется в live URL.
 */
import type { AppMapPageState } from '@live-app-map/schema';
import { Chip } from '../../ui';

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
        <Chip
          key={st.name}
          active={activeStateName === st.name}
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
        </Chip>
      ))}
    </div>
  );
}
