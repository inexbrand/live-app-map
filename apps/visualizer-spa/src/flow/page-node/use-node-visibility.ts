/**
 * Видимость ноды в кадре: IntersectionObserver сообщает store, какие экраны видны.
 */
import { useEffect, type RefObject } from 'react';
import { useAppStore } from '../../store/app-store';

/**
 * Сообщать store, видна ли нода; после новой загрузки карты (loadSeq) — заново.
 *
 * @param bodyRef - тело ноды
 * @param nodeId - id ноды
 */
export function useNodeVisibility(bodyRef: RefObject<HTMLDivElement | null>, nodeId: string): void {
  const setVisible = useAppStore((s) => s.setVisible);
  const loadSeq = useAppStore((s) => s.loadSeq);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) {
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const next = new Set(useAppStore.getState().visiblePageIds);
          if (entry.intersectionRatio >= 0.15) {
            next.add(nodeId);
          } else if (entry.intersectionRatio <= 0.02) {
            next.delete(nodeId);
          }
          const prev = useAppStore.getState().visiblePageIds;
          if (prev.size !== next.size || [...next].some((id) => !prev.has(id))) {
            setVisible(next);
          }
        }
      },
      { root: null, threshold: [0, 0.02, 0.15, 0.5, 1], rootMargin: '80px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [nodeId, setVisible, loadSeq]);
}
