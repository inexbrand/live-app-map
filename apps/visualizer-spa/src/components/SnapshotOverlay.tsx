/**
 * Оверлей снимка: согласие на просьбу агента и выделение области мышью.
 * Захват ведёт LamGrabHost; здесь только интерфейс.
 */
import { Camera, X } from 'lucide-react';
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { isUsableSelection, rectFromPoints, type Point, type Rect } from '../lib/snapshot/region';
import { isElementPick, useSnapshotStore } from '../store/snapshot-store';
import { startComment } from './comments/start-comment';
import { Button } from '@/components/ui/button';

function SelectionLayer() {
  const beginCapture = useSnapshotStore((s) => s.beginCapture);
  const [start, setStart] = useState<Point | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = { x: e.clientX, y: e.clientY };
    setStart(p);
    setRect(rectFromPoints(p, p));
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (start !== null) {
      setRect(rectFromPoints(start, { x: e.clientX, y: e.clientY }));
    }
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (start === null) {
      return;
    }
    const final = rectFromPoints(start, { x: e.clientX, y: e.clientY });
    setStart(null);
    if (isUsableSelection(final)) {
      beginCapture(final);
    } else {
      setRect(null);
    }
  };

  return (
    <div
      className={`snapshot-overlay${rect === null ? ' snapshot-overlay--dim' : ''}`}
      data-testid="snapshot-overlay"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      {rect !== null ? (
        <div
          className="snapshot-overlay__rect"
          style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        >
          <span className="snapshot-overlay__size">
            {Math.round(rect.width)}×{Math.round(rect.height)}
          </span>
        </div>
      ) : null}
      <div className="snapshot-overlay__hint" role="status">
        Выделите область для снимка · Esc — отмена
      </div>
    </div>
  );
}

function AgentRequestCard(props: { readonly note: string | null }) {
  const accept = useSnapshotStore((s) => s.accept);
  const cancel = useSnapshotStore((s) => s.cancel);
  return (
    <div className="snapshot-request ui-panel" role="dialog" aria-label="Просьба агента">
      <strong>Агент просит снимок экрана</strong>
      {props.note !== null ? <p className="drawer__hint">{props.note}</p> : null}
      <div className="drawer__actions">
        <Button type="button" variant="default" size="sm" onClick={accept}>
          <Camera size={16} strokeWidth={1.75} />
          Снять
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={cancel}>
          <X size={16} strokeWidth={1.75} />
          Отмена
        </Button>
      </div>
    </div>
  );
}

/** Подсказка выбора компонента и переход к выделению области. */
function PickHint() {
  return (
    <div className="snapshot-overlay__hint snapshot-overlay__hint--pick" role="status" data-testid="pick-hint">
      <span>Наведите на компонент живого экрана и кликните · Esc — отмена</span>
      <Button type="button" variant="outline" size="sm" onClick={() => startComment('region')} title="Выделить область мышью (⌥⇧S)">
        Область
      </Button>
    </div>
  );
}

/** Esc отменяет сессию, пока она ждёт пользователя. */
function useEscapeCancels(active: boolean, cancel: () => void): void {
  useEffect(() => {
    if (!active) {
      return;
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        cancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, cancel]);
}

/**
 * Оверлей снимка (внутри холста карты).
 */
export function SnapshotOverlay() {
  const session = useSnapshotStore((s) => s.session);
  const cancel = useSnapshotStore((s) => s.cancel);
  const active = session.phase !== 'idle' && session.phase !== 'capturing';

  useEscapeCancels(active, cancel);

  if (session.phase === 'requested') {
    return (
      <AgentRequestCard note={session.purpose.kind === 'agent' ? session.purpose.note : null} />
    );
  }
  if (session.phase === 'opening') {
    return (
      <div className="snapshot-request ui-panel" role="status">
        Разрешите доступ к этой вкладке в окне браузера…
      </div>
    );
  }
  if (session.phase === 'selecting') {
    // Выбор компонента идёт в самих страницах (пикер шлюза): слой поверх холста не нужен
    return isElementPick(session) ? <PickHint /> : <SelectionLayer />;
  }
  return null;
}
