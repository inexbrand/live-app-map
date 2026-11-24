/**
 * Видимость ноды в кадре: IntersectionObserver сообщает store, какие экраны видны.
 */
import { useEffect, type RefObject } from 'react';
import { useAppStore } from '../../store/app-store';

/** Видимые экраны после замера ноды: вошла (≥ 15 %) — добавить, вышла (≤ 2 %) — убрать. */
function visibleAfter(prev: ReadonlySet<string>, nodeId: string, ratio: number): Set<string> {
  const next = new Set(prev);
  if (ratio >= 0.15) {
    next.add(nodeId);
  } else if (ratio <= 0.02) {
    next.delete(nodeId);
  }
  return next;
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...b].every((id) => a.has(id));
}

/** Замеры пересечения ноды: store узнаёт новое множество, только если оно изменилось. */
function onIntersect(entries: readonly IntersectionObserverEntry[], nodeId: string): void {
  for (const entry of entries) {
    const prev = useAppStore.getState().visiblePageIds;
    const next = visibleAfter(prev, nodeId, entry.intersectionRatio);
    if (!sameSet(prev, next)) {
      useAppStore.getState().setVisible(next);
    }
  }
}

/** Нода ушла с холста (React Flow не рисует невидимые) — она больше не видна. */
function forgetVisible(nodeId: string): void {
  const prev = useAppStore.getState().visiblePageIds;
  if (prev.has(nodeId)) {
    const next = new Set(prev);
    next.delete(nodeId);
    useAppStore.getState().setVisible(next);
  }
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
    const io = new IntersectionObserver((entries) => onIntersect(entries, nodeId), { root: null, threshold: [0, 0.02, 0.15, 0.5, 1], rootMargin: '80px' });
    io.observe(el);
    return () => {
      io.disconnect();
      forgetVisible(nodeId);
    };
  }, [nodeId, loadSeq]);
}
