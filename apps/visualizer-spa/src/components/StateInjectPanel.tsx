/**
 * Панель стейтов / ролей / interact (UI kit).
 */
import { Copy, MousePointer2, ExternalLink } from 'lucide-react';
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
    return null;
  }

  return (
    <aside className="drawer ui-panel drawer--edge">
      <PanelHeader
        title={node.title}
        description={node.pathExample ?? node.pathPattern}
      />
      <PanelBody>
        <Field label="Живой URL" htmlFor="live-url-view">
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
            <option value="">Без роли</option>
            <option value="recruiter">Рекрутер</option>
            <option value="employer">Клиент (работодатель)</option>
          </Select>
        </Field>

        {(node.states ?? []).length > 0 ? (
          <div className="drawer__row">
            <span className="ui-field__label">Состояния экрана</span>
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
                  {st.name === 'recruiter'
                    ? 'рекрутер'
                    : st.name === 'employer'
                      ? 'клиент'
                      : st.name}
                </Chip>
              ))}
            </div>
          </div>
        ) : (
          <p className="drawer__hint">
            Отдельных состояний нет — задайте глобальную роль.
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
            В новой вкладке
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void copyUrl()}>
            <Copy size={16} strokeWidth={1.75} />
            Копировать URL
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
            Клики в iframe
          </Button>
        </div>
      </PanelBody>
    </aside>
  );
}
