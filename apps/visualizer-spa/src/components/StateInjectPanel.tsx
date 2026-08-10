/**
 * Панель инжекта стейтов для выбранной ноды + глобальная роль.
 * Live URL пересчитывается селектором store (globalRole / activeStates).
 */
import { useMemo } from 'react';
import { useAppStore } from '../store/app-store';

export function StateInjectPanel() {
  const selectedPageId = useAppStore((s) => s.selectedPageId);
  const index = useAppStore((s) => s.index);
  const globalRole = useAppStore((s) => s.globalRole);
  const setGlobalRole = useAppStore((s) => s.setGlobalRole);
  const applyPageState = useAppStore((s) => s.applyPageState);
  const activeStates = useAppStore((s) => s.activeStates);
  const liveUrl = useAppStore((s) =>
    s.selectedPageId ? s.resolveLiveUrl(s.selectedPageId) : null,
  );
  const openPageInNewTab = useAppStore((s) => s.openPageInNewTab);
  const setInteract = useAppStore((s) => s.setInteract);
  const interactPageId = useAppStore((s) => s.interactPageId);
  const setToast = useAppStore((s) => s.setToast);

  const node = selectedPageId ? index?.nodesById.get(selectedPageId) : undefined;
  const activeStateName = selectedPageId
    ? activeStates.get(selectedPageId)
    : undefined;
  const activeStateMeta = node?.states?.find((s) => s.name === activeStateName);

  const allRoleStates = useMemo(() => {
    if (!index) {
      return [];
    }
    const out: Array<{ pageId: string; title: string; name: string; note?: string }> =
      [];
    for (const n of index.nodesById.values()) {
      for (const st of n.states ?? []) {
        if (
          st.inject?.role ||
          st.name.includes('recruiter') ||
          st.name.includes('employer')
        ) {
          out.push({
            pageId: n.id,
            title: n.title,
            name: st.name,
            note: st.note,
          });
        }
      }
    }
    return out;
  }, [index]);

  const copyUrl = async () => {
    if (!liveUrl) {
      setToast('Нет URL для копирования');
      return;
    }
    try {
      await navigator.clipboard.writeText(liveUrl);
      setToast('URL скопирован');
    } catch {
      setToast('Не удалось скопировать URL');
    }
  };

  if (!selectedPageId || !node) {
    return (
      <aside className="drawer">
        <h2>Стейты и роли</h2>
        <p>
          Выберите ноду на карте. Глобальная роль ниже попадает в каждый live URL
          как query <code>lam_role</code>. Для Korbor Miniapp:{' '}
          <strong>recruiter</strong> и <strong>employer</strong> (клиент, создающий
          вакансии). Per-page chip перекрывает роль для конкретной страницы.
        </p>
        <div className="drawer__row">
          <label htmlFor="global-role">Глобальная роль (query lam_role)</label>
          <select
            id="global-role"
            value={globalRole}
            onChange={(e) => setGlobalRole(e.target.value)}
          >
            <option value="">— нет —</option>
            <option value="recruiter">Рекрутер</option>
            <option value="employer">Клиент (employer)</option>
          </select>
        </div>
        {allRoleStates.length > 0 ? (
          <>
            <p>Стейты с ролями в карте:</p>
            <ul className="drawer__list">
              {allRoleStates.slice(0, 12).map((s) => (
                <li key={`${s.pageId}:${s.name}`}>
                  {s.title}: <code>{s.name}</code>
                  {s.note ? ` — ${s.note}` : ''}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="drawer__hint">
            В текущей карте нет стейтов с role inject — достаточно глобальной роли.
          </p>
        )}
      </aside>
    );
  }

  return (
    <aside className="drawer">
      <h2>{node.title}</h2>
      <p>
        <code>{node.pathPattern}</code>
      </p>

      <div className="drawer__row">
        <label htmlFor="live-url">Live URL</label>
        <textarea id="live-url" readOnly rows={3} value={liveUrl ?? 'Нет URL'} />
      </div>

      <div className="drawer__row">
        <label htmlFor="node-global-role">Роль (global inject)</label>
        <select
          id="node-global-role"
          value={globalRole}
          onChange={(e) => setGlobalRole(e.target.value)}
        >
          <option value="">— нет —</option>
          <option value="recruiter">Рекрутер</option>
          <option value="employer">Клиент (employer)</option>
        </select>
      </div>

      {(node.states ?? []).length > 0 ? (
        <div className="drawer__row">
          <label>Стейты страницы</label>
          <div className="drawer__chips">
            {(node.states ?? []).map((st) => {
              const active = activeStates.get(node.id) === st.name;
              return (
                <button
                  key={st.name}
                  type="button"
                  className={`state-chip state-chip--hit${active ? ' state-chip--active' : ''}`}
                  title={st.note ?? st.name}
                  onClick={() => applyPageState(node.id, active ? null : st)}
                >
                  {st.name}
                  {st.inject?.role ? ` (${st.inject.role})` : ''}
                </button>
              );
            })}
          </div>
          {activeStateMeta?.note ? (
            <p className="drawer__hint">{activeStateMeta.note}</p>
          ) : null}
        </div>
      ) : (
        <p>У этой страницы нет именованных states в карте — используйте глобальную роль.</p>
      )}

      <div className="drawer__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!liveUrl}
          onClick={() => openPageInNewTab(node.id)}
        >
          Открыть вкладку
        </button>
        <button type="button" className="btn" disabled={!liveUrl} onClick={() => void copyUrl()}>
          Копировать URL
        </button>
        <button
          type="button"
          className={`btn${interactPageId === node.id ? ' btn--active' : ''}`}
          onClick={() => setInteract(interactPageId === node.id ? null : node.id)}
        >
          Interact iframe
        </button>
      </div>
    </aside>
  );
}
