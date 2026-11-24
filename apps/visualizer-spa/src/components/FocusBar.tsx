/**
 * Плашка под выбранным экраном (фокус): соседние экраны, роль, выбор компонента
 * или работа с приложением, замечание к экрану, открытые замечания экрана,
 * открыть во вкладке. Едет за камерой: место — каждый кадр по рамке ноды.
 */
import type { AppMapPageState } from '@live-app-map/schema';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { barPlace } from '../lib/comments/place';
import { useAppStore } from '../store/app-store';
import { useCommentsStore } from '../store/comments-store';
import { commentOnScreen, neighborPage, setFocusMode } from './comments/start-comment';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Kbd } from '@/components/ui/kbd';

/** Подпись роли: роли по-русски, остальное как есть. */
function stateLabel(name: string): string {
  if (name === 'recruiter') {
    return 'Рекрутер';
  }
  return name === 'employer' ? 'Клиент' : name;
}

/** Ставит плашку под нодой каждый кадр. */
function useFollowNode(pageId: string, box: { current: HTMLDivElement | null }): void {
  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      const el = box.current;
      const node = document.querySelector(`[data-lam-node="${CSS.escape(pageId)}"]`);
      if (el !== null && node !== null) {
        const r = node.getBoundingClientRect();
        const p = barPlace({ left: r.left, top: r.top, width: r.width, height: r.height }, { width: window.innerWidth, height: window.innerHeight }, { width: el.offsetWidth, height: el.offsetHeight });
        el.style.transform = `translate(${Math.round(p.left)}px, ${Math.round(p.top)}px)`;
        el.style.visibility = 'visible';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pageId, box]);
}

function Neighbor(props: { readonly from: string; readonly by: -1 | 1 }) {
  const id = neighborPage(props.from, props.by);
  const title = useAppStore((s) => (id === null ? null : (s.index?.nodesById.get(id)?.title ?? null)));
  if (id === null || title === null) {
    return null;
  }
  return (
    <Button type="button" variant="ghost" size="sm" title={props.by === -1 ? 'Предыдущий экран ([)' : 'Следующий экран (])'} onClick={() => useAppStore.getState().selectPage(id)}>
      {props.by === -1 ? <ChevronLeft size={14} /> : null}
      <span className="focus-bar__neighbor">{title}</span>
      {props.by === 1 ? <ChevronRight size={14} /> : null}
    </Button>
  );
}

/** Стабильная пустота: новый [] в селекторе zustand — новый снимок на каждый вызов и бесконечная перерисовка. */
const NO_STATES: readonly AppMapPageState[] = [];

function Roles(props: { readonly pageId: string }) {
  const states = useAppStore((s) => s.index?.nodesById.get(props.pageId)?.states ?? NO_STATES);
  const active = useAppStore((s) => s.activeStates.get(props.pageId));
  const apply = useAppStore((s) => s.applyPageState);
  if (states.length === 0) {
    return null;
  }
  const onState = (st: AppMapPageState): void => apply(props.pageId, active === st.name ? null : st);
  return (
    <ToggleGroup variant="outline" size="sm" spacing={0} aria-label="Роль" value={active === undefined ? [] : [active]}>
      {states.map((st) => (
        <ToggleGroupItem key={st.name} value={st.name} title={st.note} onClick={() => onState(st)}>
          {stateLabel(st.name)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function Bar(props: { readonly pageId: string }) {
  const { pageId } = props;
  const box = useRef<HTMLDivElement | null>(null);
  const interact = useAppStore((s) => s.interactPageId === pageId);
  const open = useCommentsStore((s) => s.threads.filter((t) => t.anchor.pageId === pageId && t.stage !== 'done').length);
  useFollowNode(pageId, box);
  return (
    <div ref={box} className="focus-bar ui-panel" data-testid="focus-bar" style={{ visibility: 'hidden' }}>
      <Neighbor from={pageId} by={-1} />
      <Roles pageId={pageId} />
      <ToggleGroup variant="outline" size="sm" spacing={0} aria-label="Режим экрана" value={[interact ? 'interact' : 'pick']}>
        <ToggleGroupItem value="pick" onClick={() => setFocusMode('pick')} title="Клик по экрану выбирает компонент для замечания">
          Выбор компонента <Kbd>C</Kbd>
        </ToggleGroupItem>
        <ToggleGroupItem value="interact" onClick={() => setFocusMode('interact')} title="Клики и клавиши уходят в приложение">
          Приложение <Kbd>I</Kbd>
        </ToggleGroupItem>
      </ToggleGroup>
      <Button type="button" variant="ghost" size="sm" onClick={() => commentOnScreen(pageId)} title="Замечание к экрану целиком (W)">
        К экрану <Kbd>W</Kbd>
      </Button>
      {open > 0 ? (
        <Button type="button" variant="ghost" size="sm" className="focus-bar__open" data-testid="focus-open" onClick={() => useCommentsStore.getState().openSheet(pageId)}>
          {open} открыто
        </Button>
      ) : null}
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Открыть во вкладке" title="Открыть во вкладке" onClick={() => useAppStore.getState().openPageInNewTab(pageId)}>
        <ExternalLink size={15} strokeWidth={1.75} />
      </Button>
      <Neighbor from={pageId} by={1} />
    </div>
  );
}

/**
 * Плашка выбранного экрана (только экраны, не сервисы).
 */
export function FocusBar() {
  const pageId = useAppStore((s) => (s.selectedPageId !== null && s.index?.nodesById.get(s.selectedPageId)?.kind === 'page' ? s.selectedPageId : null));
  return pageId === null ? null : <Bar key={pageId} pageId={pageId} />;
}
