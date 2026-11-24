/**
 * Колесо над экраном, который длиннее своего окна, прокручивает страницу, а не холст.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { wheelToPage } from '../../lib/iframe-wheel';
import { streamClient } from '../../lib/stream/stream-client';

/**
 * Нативный слушатель колеса: d3-zoom холста ловит колесо раньше делегированных событий React.
 *
 * @param bodyRef - тело ноды
 * @param nodeId - экран
 * @param scrollable - страница длиннее окна
 * @param pageWidth - ширина окна страницы
 */
export function useWheelToPage(bodyRef: RefObject<HTMLDivElement | null>, nodeId: string, scrollable: boolean, pageWidth: number): void {
  const wheelTarget = useRef({ scrollable: false, pageWidth });
  wheelTarget.current = { scrollable, pageWidth };
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) {
      return;
    }
    const onWheel = (e: WheelEvent) => {
      const screen = el.querySelector('.page-node__screen, .page-node__snapshot');
      const { scrollable, pageWidth } = wheelTarget.current;
      const msg = screen === null || !scrollable ? null : wheelToPage(e, screen.getBoundingClientRect(), pageWidth);
      if (msg === null) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      streamClient.post(nodeId, msg);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [nodeId]);
}
