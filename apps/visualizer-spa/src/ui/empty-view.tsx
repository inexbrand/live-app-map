/**
 * Пустой вид: в карте нет данных для него — подсказка, как их получить.
 */
import type { ReactNode } from 'react';

/** Пустое состояние вида `view` (класс `${view}--empty`, data-testid = view). */
export function EmptyView({ view, children }: { view: string; children: ReactNode }) {
  return (
    <div className={`${view} ${view}--empty`} data-testid={view}>
      <p>{children}</p>
    </div>
  );
}
