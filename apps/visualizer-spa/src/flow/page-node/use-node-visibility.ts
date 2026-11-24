/**
 * Видимость ноды в кадре: IntersectionObserver сообщает, какие экраны видны.
 * Замеры копятся, пока камера движется, и уходят в store одним набором после
 * паузы: на каждом шаге зума пересчёт живых и перерисовка нод стоили долгих
 * задач и кадров.
 */
import { useEffect, type RefObject } from 'react';
import { useAppStore } from '../../store/app-store';

/** Пауза без новых замеров, после которой набор видимых уходит в store, мс. */
export const VISIBILITY_SETTLE_MS = 150;

/** Доля ноды в кадре по последнему замеру; null — нода ушла с холста. */
const pending = new Map<string, number | null>();
/** Карта, на которой сделаны замеры: после смены карты они не в счёт. */
let pendingDoc: unknown = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Видимые экраны после замеров: вошла (≥ 15 %) — добавить, вышла (≤ 2 %) или ушла — убрать. */
function visibleAfter(prev: ReadonlySet<string>, changes: ReadonlyMap<string, number | null>): Set<string> {
  const next = new Set(prev);
  for (const [nodeId, ratio] of changes) {
    if (ratio === null || ratio <= 0.02) {
      next.delete(nodeId);
    } else if (ratio >= 0.15) {
      next.add(nodeId);
    }
  }
  return next;
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...b].every((id) => a.has(id));
}

/** Применить накопленные замеры; store узнаёт новый набор, только если он изменился. */
function flush(): void {
  timer = null;
  if (pendingDoc !== useAppStore.getState().document) {
    pending.clear();
    return;
  }
  const prev = useAppStore.getState().visiblePageIds;
  const next = visibleAfter(prev, pending);
  pending.clear();
  if (!sameSet(prev, next)) {
    useAppStore.getState().setVisible(next);
  }
}

/** Запомнить замер и отложить применение до паузы. */
function note(nodeId: string, ratio: number | null): void {
  const doc = useAppStore.getState().document;
  if (doc !== pendingDoc) {
    pending.clear();
    pendingDoc = doc;
  }
  pending.set(nodeId, ratio);
  if (timer !== null) {
    clearTimeout(timer);
  }
  timer = setTimeout(flush, VISIBILITY_SETTLE_MS);
}

/**
 * Сообщать store, видна ли нода; после новой загрузки карты (loadSeq) — заново.
 *
 * @param bodyRef - тело ноды
 * @param nodeId - id ноды
 */
export function useNodeVisibility(bodyRef: RefObject<HTMLDivElement | null>, nodeId: string): void {
  const loadSeq = useAppStore((s) => s.loadSeq);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) {
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          note(nodeId, entry.intersectionRatio);
        }
      },
      { root: null, threshold: [0, 0.02, 0.15, 0.5, 1], rootMargin: '80px' },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      // Нода ушла с холста (React Flow не рисует невидимые) — она больше не видна
      note(nodeId, null);
    };
  }, [nodeId, loadSeq]);
}
