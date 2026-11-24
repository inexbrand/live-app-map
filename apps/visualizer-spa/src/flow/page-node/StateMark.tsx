/**
 * Метки узла-состояния: значок вида состояния у названия и подпись об ошибке шага
 * поверх экрана (не меняет размер ноды — раскладка считает его без подписи).
 */
import type { AppMapStateKind } from '@live-app-map/schema';
import { Database, Inbox, LoaderCircle, MousePointerClick, TriangleAlert, type LucideIcon } from 'lucide-react';

/** Значок и подпись вида состояния. */
const KINDS: Readonly<Record<AppMapStateKind, { readonly icon: LucideIcon; readonly label: string }>> = {
  data: { icon: Database, label: 'С данными' },
  empty: { icon: Inbox, label: 'Пусто' },
  error: { icon: TriangleAlert, label: 'Ошибка' },
  loading: { icon: LoaderCircle, label: 'Загрузка' },
  ui: { icon: MousePointerClick, label: 'Интерфейс' },
};

/**
 * Значок вида состояния у названия узла.
 *
 * @param props - вид состояния
 */
export function StateKindIcon({ kind }: { readonly kind: AppMapStateKind }) {
  const { icon: Icon, label } = KINDS[kind];
  return (
    <span className={`page-node__state-kind page-node__state-kind--${kind}`} title={`Состояние: ${label}`} aria-label={`Состояние: ${label}`} data-lam-state-kind={kind}>
      <Icon className="size-3.5" strokeWidth={2} />
    </span>
  );
}

/**
 * Ошибка шагов состояния поверх экрана: «шаг N не выполнен: …».
 *
 * @param props - текст ошибки
 */
export function StepError({ error }: { readonly error: string }) {
  return (
    <div className="page-node__step-error" role="alert" data-lam-step-error title={error}>
      {error}
    </div>
  );
}
