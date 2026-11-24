import type { ReactNode } from 'react';

/** Обёртка страницы компонента — как провайдеры приложения. */
export function Frame({ children }: { children: ReactNode }) {
  return <div data-testid="frame">{children}</div>;
}
