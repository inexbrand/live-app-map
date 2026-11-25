/**
 * Переключатель видов карты в шапке.
 */
import { useEffect } from 'react';
import { useAppStore } from '../../store/app-store';
import { useComponentsStore } from '../../store/components-store';
import { useViewStore } from '../../store/view-store';
import { ToolbarButton } from './ToolbarButton';
import { visibleViewTabs } from './view-tabs';

/** Вкладки видов: экраны всегда, API/БД/документация — если они есть в карте, компоненты — если открыт проект. */
export function ViewTabs() {
  const view = useViewStore((s) => s.view);
  const setView = useViewStore((s) => s.setView);
  const hasDb = useAppStore((s) => (s.document?.code?.tables.length ?? 0) > 0);
  const hasApi = useAppStore((s) => (s.document?.code?.routes.length ?? 0) > 0);
  const hasDocs = useAppStore((s) => s.document?.docs !== undefined);
  const hasProject = useComponentsStore((s) => s.projectOpen === true);
  const probeProject = useComponentsStore((s) => s.probeProject);
  useEffect(() => {
    void probeProject((url) => fetch(url));
  }, [probeProject]);
  return (
    <div className="toolbar__group" role="group" aria-label="Вид">
      {visibleViewTabs({ hasApi, hasDb, hasDocs, hasProject }).map((tab) => (
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
