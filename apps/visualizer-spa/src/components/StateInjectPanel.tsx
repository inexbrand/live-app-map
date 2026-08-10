/**
 * Панель стейтов / ролей / interact (UI kit).
 */
import { Copy, MousePointer2, ExternalLink } from 'lucide-react';
import { useMemo } from 'react';
import { Button, Chip, Field, PanelBody, PanelHeader, Select } from '../ui';
import { useAppStore } from '../store/app-store';

/**
 * Правый drawer: роль, стейты, live URL.
 */
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

  const allRoleStates = useMemo(() => {
    if (!index) {
      return [];
    }
    const out: Array<{ pageId: string; title: string; name: string }> = [];
    for (const n of index.nodesById.values()) {
      for (const st of n.states ?? []) {
        if (st.inject?.role) {
          out.push({ pageId: n.id, title: n.title, name: st.name });
        }
      }
    }
    return out;
  }, [index]);

  const copyUrl = async () => {
    if (!liveUrl) {
      setToast('Нет URL');
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
      <aside className="drawer ui-panel">
        <PanelHeader
          title="Стейты и роли"
          description="Выберите ноду. Глобальная роль → query lam_role на live URL."
        />
        <PanelBody>
          <Field label="Глобальная роль" htmlFor="global-role">
            <Select
              id="global-role"
              value={globalRole}
              onChange={(e) => setGlobalRole(e.target.value)}
            >
              <option value="">— нет —</option>
              <option value="recruiter">Рекрутер</option>
              <option value="employer">Клиент (employer)</option>
            </Select>
          </Field>
          {allRoleStates.length > 0 ? (
            <p className="drawer__hint">
              Стейты с ролями: {allRoleStates.length} (см. chips на нодах).
            </p>
          ) : null}
        </PanelBody>
      </aside>
    );
  }

  return (
    <aside className="drawer ui-panel">
      <PanelHeader
        title={node.title}
        description={node.pathExample ?? node.pathPattern}
      />
      <PanelBody>
        <Field label="Live URL" htmlFor="live-url-view">
          <textarea
            id="live-url-view"
            className="ui-textarea font-mono"
            readOnly
            rows={3}
            value={liveUrl ?? '—'}
          />
        </Field>

        <Field label="Глобальная роль" htmlFor="node-global-role">
          <Select
            id="node-global-role"
            value={globalRole}
            onChange={(e) => setGlobalRole(e.target.value)}
          >
            <option value="">— нет —</option>
            <option value="recruiter">Рекрутер</option>
            <option value="employer">Клиент (employer)</option>
          </Select>
        </Field>

        {(node.states ?? []).length > 0 ? (
          <div className="drawer__row">
            <span className="ui-field__label">Стейты страницы</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(node.states ?? []).map((st) => (
                <Chip
                  key={st.name}
                  active={activeStateName === st.name}
                  title={st.note}
                  onClick={() =>
                    applyPageState(
                      node.id,
                      activeStateName === st.name ? null : st,
                    )
                  }
                >
                  {st.name}
                  {st.inject?.role ? ` · ${st.inject.role}` : ''}
                </Chip>
              ))}
            </div>
          </div>
        ) : (
          <p className="drawer__hint">
            Именованных states нет — используйте глобальную роль.
          </p>
        )}

        <div className="drawer__actions">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => openPageInNewTab(node.id)}
          >
            <ExternalLink size={16} strokeWidth={1.75} />
            Вкладка
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void copyUrl()}>
            <Copy size={16} strokeWidth={1.75} />
            URL
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            active={interactPageId === node.id}
            onClick={() =>
              setInteract(interactPageId === node.id ? null : node.id)
            }
          >
            <MousePointer2 size={16} strokeWidth={1.75} />
            Interact
          </Button>
        </div>
      </PanelBody>
    </aside>
  );
}
