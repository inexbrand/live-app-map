/**
 * Окно замечания у компонента: что выбрано (компонент, файл:строка), прошлые
 * замечания к нему с решением по ответам агента и поле нового. Едет за камерой:
 * место пересчитывается каждый кадр по рамке экрана; элемент ушёл из кадра —
 * окно закрывается, текст остаётся черновиком.
 */
import type { CommentThread } from '@live-app-map/mcp-server/comments-schema';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { quoteText, sourceRef } from '../../lib/comments/format';
import { popoverPlace, type Box } from '../../lib/comments/place';
import { useAppStore } from '../../store/app-store';
import { targetKey, threadsFor, useCommentsStore, type CommentTarget } from '../../store/comments-store';
import { CommentField } from './CommentField';
import { ThreadCard } from './ThreadCard';
import { Button } from '@/components/ui/button';

/** Ширина окна. */
const WIDTH = 360;
/** Сколько замечаний показывать сразу; больше — свёрнуты в строку. */
const OPEN_LIMIT = 2;

/**
 * Рамка экрана ноды во вкладке или null (нода не на холсте).
 *
 * @param pageId - нода
 */
export function screenBox(pageId: string): Box | null {
  const el = document.querySelector(`[data-lam-preview-body][data-page-id="${CSS.escape(pageId)}"]`);
  if (el === null) {
    return null;
  }
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** Закрыть окно; был текст — сказать, что он сохранён. */
function closeKeepingDraft(target: CommentTarget): void {
  const store = useCommentsStore.getState();
  if (store.drafts.has(targetKey(target.anchor))) {
    useAppStore.getState().setToast('Черновик сохранён');
  }
  store.closeTarget();
}

/** Ставит окно у цели каждый кадр; ушла из кадра после показа — закрывает. */
function useFollowTarget(target: CommentTarget, box: { current: HTMLDivElement | null }): void {
  useEffect(() => {
    let raf = 0;
    let shown = false;
    const tick = (): void => {
      const el = box.current;
      const screen = screenBox(target.anchor.pageId);
      const place = el === null || screen === null ? null : popoverPlace(screen, target.frame, { width: window.innerWidth, height: window.innerHeight }, { width: WIDTH, height: el.offsetHeight });
      if (place === null && shown) {
        closeKeepingDraft(target);
        return;
      }
      if (el !== null && place !== null) {
        shown = true;
        el.style.transform = `translate(${Math.round(place.left)}px, ${Math.round(place.top)}px)`;
        el.style.visibility = 'visible';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, box]);
}

/** Что выбрано: компонент (или тег), текст элемента, исходник — или экран целиком. */
function TargetTitle(props: { readonly target: CommentTarget }) {
  const el = props.target.anchor.element;
  if (el === null) {
    return (
      <div className="comment-pop__what">
        <strong>Экран целиком</strong>
        <span>{props.target.anchor.pageTitle}</span>
      </div>
    );
  }
  const src = el.component?.source ?? null;
  return (
    <div className="comment-pop__what" title={el.domPath}>
      <strong>{el.component?.name ?? el.tag}</strong>
      {src !== null ? <span>{sourceRef(src)}</span> : el.text !== '' ? <span>«{quoteText(el.text, 40)}»</span> : null}
    </div>
  );
}

/** Прошлые замечания к цели: до двух сразу, больше — строкой «Замечаний: N, проверить: M». */
function History(props: { readonly threads: readonly CommentThread[]; readonly focusId: string | null }) {
  const { threads, focusId } = props;
  const [open, setOpen] = useState(false);
  if (threads.length === 0) {
    return null;
  }
  const review = threads.filter((t) => t.stage === 'review').length;
  if (threads.length > OPEN_LIMIT && !open) {
    return (
      <button type="button" className="comment-pop__more" onClick={() => setOpen(true)}>
        Замечаний к компоненту: {threads.length}
        {review > 0 ? `, проверить: ${review}` : ''}
      </button>
    );
  }
  return (
    <div className="comment-pop__history" data-testid="comment-history">
      {threads.map((t) => (
        <ThreadCard key={t.id} thread={t} focused={t.id === focusId} />
      ))}
    </div>
  );
}

function PopoverCard(props: { readonly target: CommentTarget }) {
  const { target } = props;
  const box = useRef<HTMLDivElement | null>(null);
  const threads = useCommentsStore((s) => s.threads);
  const focusId = useCommentsStore((s) => s.focusId);
  const text = useCommentsStore((s) => s.drafts.get(targetKey(target.anchor))?.text ?? '');
  const saving = useCommentsStore((s) => s.saving);
  const saveError = useCommentsStore((s) => s.saveError);
  const mine = threadsFor(threads, target.anchor);
  useFollowTarget(target, box);
  const store = useCommentsStore.getState();
  const name = target.anchor.element?.component?.name ?? 'экраном';
  return (
    <div ref={box} className="comment-pop ui-panel" role="dialog" aria-label="Замечание" data-testid="comment-popover" style={{ width: WIDTH, visibility: 'hidden' }}>
      <div className="comment-pop__head">
        <TargetTitle target={target} />
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Закрыть" onClick={() => closeKeepingDraft(target)}>
          <X size={16} strokeWidth={1.75} />
        </Button>
      </div>
      <History threads={mine} focusId={focusId} />
      <CommentField
        value={text}
        onChange={store.setDraftText}
        onSubmit={(t) => {
          void store.save(t).then((ok) => {
            if (ok) {
              useAppStore.getState().setToast('Замечание отправлено агенту');
            }
          });
        }}
        onEscape={() => closeKeepingDraft(target)}
        placeholder={`Что не так с ${name}?`}
        busy={saving}
        error={saveError}
      />
    </div>
  );
}

/**
 * Окно замечания текущей цели; другой экран в фокусе — окно закрывается.
 */
export function CommentPopover() {
  const target = useCommentsStore((s) => s.target);
  const selected = useAppStore((s) => s.selectedPageId);
  useEffect(() => {
    if (target !== null && selected !== target.anchor.pageId) {
      closeKeepingDraft(target);
    }
  }, [target, selected]);
  if (target === null || selected !== target.anchor.pageId) {
    return null;
  }
  return <PopoverCard key={targetKey(target.anchor)} target={target} />;
}
