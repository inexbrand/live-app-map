/**
 * Панель стейтов / ролей / interact (UI kit).
 */
import { Copy, MousePointer2, ExternalLink, X } from 'lucide-react';
import { useMemo } from 'react';
import { selectNodeCode } from '../lib/node-code';
import { CodePanel } from './CodePanel';
import { Button, Chip, Field, PanelBody, PanelHeader, Select } from '../ui';
import { useAppStore } from '../store/app-store';

type CodeView = ReturnType<typeof selectNodeCode>;
type MapNode = NonNullable<ReturnType<NonNullable<ReturnType<typeof useAppStore.getState>['index']>['nodesById']['get']>>;

/**
 * Скопировать живой URL в буфер; итог — в toast.
 *
 * @param liveUrl - URL экрана (null — нет)
 * @param setToast - показать сообщение
 */
async function copyLiveUrl(liveUrl: string | null, setToast: (m: string) => void): Promise<void> {
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
}

/** Подпись стейта: роли по-русски, остальное как есть. */
function stateLabel(name: string): string {
  if (name === 'recruiter') {
    return 'рекрутер';
  }
  return name === 'employer' ? 'клиент' : name;
}

/** Есть что показать в панели кода экрана: функции файла или вызовы API. */
function hasPageCode(codeView: CodeView): codeView is NonNullable<CodeView> {
  return codeView !== null && (codeView.symbols.length > 0 || (codeView.kind === 'page' && codeView.api.length + codeView.unmatched.length > 0));
}

/** Крестик панели: снимает выбор экрана, панель закрывается. */
function CloseButton() {
  const selectPage = useAppStore((s) => s.selectPage);
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label="Закрыть панель" title="Закрыть (Esc)" onClick={() => selectPage(null)}>
      <X size={16} />
    </Button>
  );
}

/** Drawer сервиса: панель кода. */
function ServiceDrawer(props: { readonly node: MapNode; readonly codeView: CodeView }) {
  const { node, codeView } = props;
  return (
    <aside className="drawer ui-panel drawer--edge drawer--code" data-testid="service-drawer">
      <PanelHeader title={node.title} description={node.pathPattern} action={<CloseButton />} />
      <PanelBody>
        {codeView === null ? <p className="drawer__hint">В карте нет раздела code для сервиса.</p> : <CodePanel view={codeView} />}
      </PanelBody>
    </aside>
  );
}

/** Стейты экрана чипами: щелчок включает, повторный — снимает. */
function StateChips(props: { readonly node: MapNode }) {
  const { node } = props;
  const applyPageState = useAppStore((s) => s.applyPageState);
  const activeStateName = useAppStore((s) => s.activeStates.get(node.id));
  const states = node.states ?? [];
  if (states.length === 0) {
    return <p className="drawer__hint">Отдельных состояний нет — задайте глобальную роль.</p>;
  }
  return (
    <div className="drawer__row">
      <span className="ui-field__label">Состояния экрана</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {states.map((st) => (
          <Chip key={st.name} active={activeStateName === st.name} title={st.note} onClick={() => applyPageState(node.id, activeStateName === st.name ? null : st)}>
            {stateLabel(st.name)}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/** Кнопки экрана: новая вкладка, копировать URL, клики в iframe. */
function PageActions(props: { readonly node: MapNode; readonly liveUrl: string | null }) {
  const { node } = props;
  const openPageInNewTab = useAppStore((s) => s.openPageInNewTab);
  const setInteract = useAppStore((s) => s.setInteract);
  const interactPageId = useAppStore((s) => s.interactPageId);
  const setToast = useAppStore((s) => s.setToast);
  const interacting = interactPageId === node.id;
  return (
    <div className="drawer__actions">
      <Button type="button" variant="primary" size="sm" onClick={() => openPageInNewTab(node.id)}>
        <ExternalLink size={16} strokeWidth={1.75} />
        В новой вкладке
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => void copyLiveUrl(props.liveUrl, setToast)}>
        <Copy size={16} strokeWidth={1.75} />
        Копировать URL
      </Button>
      <Button type="button" variant="outline" size="sm" active={interacting} onClick={() => setInteract(interacting ? null : node.id)}>
        <MousePointer2 size={16} strokeWidth={1.75} />
        Клики в iframe
      </Button>
    </div>
  );
}

/** Drawer экрана: живой URL, роль, стейты, действия, код. */
function PageDrawer(props: { readonly node: MapNode; readonly codeView: CodeView }) {
  const { node, codeView } = props;
  const globalRole = useAppStore((s) => s.globalRole);
  const setGlobalRole = useAppStore((s) => s.setGlobalRole);
  const liveUrl = useAppStore((s) => s.resolveLiveUrl(node.id));
  return (
    <aside className="drawer ui-panel drawer--edge">
      <PanelHeader title={node.title} description={node.pathExample ?? node.pathPattern} action={<CloseButton />} />
      <PanelBody>
        <Field label="Живой URL" htmlFor="live-url-view">
          <textarea id="live-url-view" className="ui-textarea font-mono" readOnly rows={3} value={liveUrl ?? '—'} />
        </Field>

        <Field label="Глобальная роль" htmlFor="node-global-role">
          <Select id="node-global-role" value={globalRole} onChange={(e) => setGlobalRole(e.target.value)}>
            <option value="">Без роли</option>
            <option value="recruiter">Рекрутер</option>
            <option value="employer">Клиент (работодатель)</option>
          </Select>
        </Field>

        <StateChips node={node} />
        <PageActions node={node} liveUrl={liveUrl} />

        {hasPageCode(codeView) ? <CodePanel view={codeView} /> : null}
      </PanelBody>
    </aside>
  );
}

/**
 * Правый drawer: роль, стейты, live URL.
 */
export function StateInjectPanel() {
  const selectedPageId = useAppStore((s) => s.selectedPageId);
  const node = useAppStore((s) => (s.selectedPageId ? s.index?.nodesById.get(s.selectedPageId) : undefined));
  const mapDocument = useAppStore((s) => s.document);
  const codeView = useMemo(
    () => (mapDocument !== null && selectedPageId !== null ? selectNodeCode(mapDocument, selectedPageId) : null),
    [mapDocument, selectedPageId],
  );
  if (!selectedPageId || !node) {
    return null;
  }
  return node.kind === 'service' ? <ServiceDrawer node={node} codeView={codeView} /> : <PageDrawer node={node} codeView={codeView} />;
}
