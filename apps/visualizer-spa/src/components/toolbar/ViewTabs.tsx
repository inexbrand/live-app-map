/**
 * Переключатель видов карты в шапке.
 */
import { useAppStore } from '../../store/app-store';
import { useViewStore } from '../../store/view-store';
import { ToolbarButton } from './ToolbarButton';
import { visibleViewTabs } from './view-tabs';

/** Вкладки видов: экраны всегда, API/БД/документация — если они есть в карте. */
export function ViewTabs() {
  const view = useViewStore((s) => s.view);
  const setView = useViewStore((s) => s.setView);
  const hasDb = useAppStore((s) => (s.document?.code?.tables.length ?? 0) > 0);
  const hasApi = useAppStore((s) => (s.document?.code?.routes.length ?? 0) > 0);
  const hasDocs = useAppStore((s) => s.document?.docs !== undefined);
  return (
    <div className="toolbar__group" role="group" aria-label="Вид">
      {visibleViewTabs({ hasApi, hasDb, hasDocs }).map((tab) => (
        <ToolbarButton
          key={tab.view}
          icon={tab.icon}
          label={tab.label}
          selected={view === tab.view}
          aria-pressed={view === tab.view}
          onClick={() => setView(tab.view)}
          data-testid={tab.testId}
          title={tab.title}
        />
      ))}
    </div>
  );
}
