/**
 * Панель выбранного экрана (или сервиса) справа: живой URL, роль, состояния, действия,
 * статус и лог экрана, код.
 */
import { Copy, MousePointer2, ExternalLink, X } from 'lucide-react';
import { useMemo } from 'react';
import { selectNodeCode } from '../lib/node-code';
import { CodePanel } from './CodePanel';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import { OptionSelect } from './option-select';
import { ScreenStatusLog } from './ScreenStatusLog';
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
    <Button variant="ghost" size="icon-sm" aria-label="Закрыть панель" title="Закрыть (Esc)" onClick={() => selectPage(null)}>
      <X />
    </Button>
  );
}

/** Оболочка панели справа: заголовок с крестиком и прокручиваемое тело. */
function SidePanel(props: { readonly title: string; readonly description?: string; readonly testId: string; readonly children: ReactNode }) {
  return (
    <aside className="absolute top-3 right-3 bottom-3 z-20 flex w-[min(400px,calc(100%-24px))] flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-lg" data-testid={props.testId}>
      <header className="flex items-start justify-between gap-2 border-b p-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-medium">{props.title}</h2>
          {props.description === undefined ? null : <p className="truncate text-sm text-muted-foreground">{props.description}</p>}
        </div>
        <CloseButton />
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">{props.children}</div>
    </aside>
  );
}

/** Drawer сервиса: панель кода. */
function ServiceDrawer(props: { readonly node: MapNode; readonly codeView: CodeView }) {
  const { node, codeView } = props;
  return (
    <SidePanel title={node.title} description={node.pathPattern} testId="service-drawer">
      {codeView === null ? <p className="text-sm text-muted-foreground">В карте нет раздела code для сервиса.</p> : <CodePanel view={codeView} />}
    </SidePanel>
  );
}

/** Стейты экрана чипами: щелчок включает, повторный — снимает. */
function StateChips(props: { readonly node: MapNode }) {
  const { node } = props;
  const applyPageState = useAppStore((s) => s.applyPageState);
  const activeStateName = useAppStore((s) => s.activeStates.get(node.id));
  const states = node.states ?? [];
  if (states.length === 0) {
    return <p className="text-sm text-muted-foreground">Отдельных состояний нет — задайте глобальную роль.</p>;
  }
  return (
    <Field>
      <FieldLabel>Состояния экрана</FieldLabel>
      <div className="flex flex-wrap gap-1.5">
        {states.map((st) => (
          <Toggle key={st.name} variant="outline" size="sm" pressed={activeStateName === st.name} title={st.note} onPressedChange={() => applyPageState(node.id, activeStateName === st.name ? null : st)}>
            {stateLabel(st.name)}
          </Toggle>
        ))}
      </div>
    </Field>
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
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => openPageInNewTab(node.id)}>
        <ExternalLink strokeWidth={1.75} />
        В новой вкладке
      </Button>
      <Button variant="outline" size="sm" onClick={() => void copyLiveUrl(props.liveUrl, setToast)}>
        <Copy strokeWidth={1.75} />
        Копировать URL
      </Button>
      <Button variant={interacting ? 'default' : 'outline'} size="sm" aria-pressed={interacting} onClick={() => setInteract(interacting ? null : node.id)}>
        <MousePointer2 strokeWidth={1.75} />
        Клики в iframe
      </Button>
    </div>
  );
}

/** Drawer экрана: живой URL, роль, стейты, действия, код. */
function PageDrawer(props: { readonly node: MapNode; readonly codeView: CodeView }) {
  const { node, codeView } = props;
  const liveUrl = useAppStore((s) => s.resolveLiveUrl(node.id));
  return (
    <SidePanel title={node.title} description={node.pathExample ?? node.pathPattern} testId="page-drawer">
      <Field>
        <FieldLabel htmlFor="live-url-view">Живой URL</FieldLabel>
        <Textarea id="live-url-view" className="font-mono text-xs" readOnly rows={3} value={liveUrl ?? '—'} />
      </Field>

      <StateChips node={node} />
      <PageActions node={node} liveUrl={liveUrl} />
      <ScreenStatusLog pageId={node.id} />

      {hasPageCode(codeView) ? <CodePanel view={codeView} /> : null}
    </SidePanel>
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
