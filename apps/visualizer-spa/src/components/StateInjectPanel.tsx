/**
 * Панель инжекта стейтов для выбранной ноды + глобальная роль.
 */
import { useMemo, useState } from 'react';
import { useAppStore } from '../store/app-store';

export function StateInjectPanel() {
  const selectedPageId = useAppStore((s) => s.selectedPageId);
  const index = useAppStore((s) => s.index);
  const globalRole = useAppStore((s) => s.globalRole);
  const setGlobalRole = useAppStore((s) => s.setGlobalRole);
  const applyPageState = useAppStore((s) => s.applyPageState);
  const activeStates = useAppStore((s) => s.activeStates);
  const resolveLiveUrl = useAppStore((s) => s.resolveLiveUrl);
  const openPageInNewTab = useAppStore((s) => s.openPageInNewTab);
  const setInteract = useAppStore((s) => s.setInteract);
  const interactPageId = useAppStore((s) => s.interactPageId);

  const [customQuery, setCustomQuery] = useState('lam_role=recruiter');

  const node = selectedPageId ? index?.nodesById.get(selectedPageId) : undefined;
  const liveUrl = selectedPageId ? resolveLiveUrl(selectedPageId) : null;

  const allRoleStates = useMemo(() => {
    if (!index) {
      return [];
    }
    const out: Array<{ pageId: string; title: string; name: string; note?: string }> = [];
    for (const n of index.nodesById.values()) {
      for (const st of n.states ?? []) {
        if (st.inject?.role || st.name.includes('recruiter') || st.name.includes('employer')) {
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

  if (!selectedPageId || !node) {
    return (
      <aside className="drawer">
        <h2>Стейты и роли</h2>
        <p>
          Выберите ноду на карте. Для Korbor Miniapp доступны роли{' '}
          <strong>recruiter</strong> и <strong>employer</strong> (клиент, создающий
          вакансии).
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
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {allRoleStates.slice(0, 12).map((s) => (
                <li key={`${s.pageId}:${s.name}`}>
                  {s.title}: <code>{s.name}</code>
                </li>
              ))}
            </ul>
          </>
        ) : null}
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
        <label>Live URL</label>
        <textarea readOnly rows={3} value={liveUrl ?? '—'} />
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(node.states ?? []).map((st) => {
              const active = activeStates.get(node.id) === st.name;
              return (
                <button
                  key={st.name}
                  type="button"
                  className={`state-chip${active ? ' state-chip--active' : ''}`}
                  title={st.note}
                  onClick={() => applyPageState(node.id, active ? null : st)}
                >
                  {st.name}
                  {st.inject?.role ? ` (${st.inject.role})` : ''}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p>У этой страницы нет именованных states в карте — используйте глобальную роль.</p>
      )}

      <div className="drawer__row">
        <label htmlFor="custom-q">Быстрый query (справка)</label>
        <input
          id="custom-q"
          value={customQuery}
          onChange={(e) => setCustomQuery(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn--primary" onClick={() => openPageInNewTab(node.id)}>
          Открыть вкладку
        </button>
        <button
          type="button"
          className={`btn${interactPageId === node.id ? ' btn--active' : ''}`}
          onClick={() =>
            setInteract(interactPageId === node.id ? null : node.id)
          }
        >
          Interact iframe
        </button>
      </div>
    </aside>
  );
}
