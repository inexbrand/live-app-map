/**
 * Колесо над живым экраном, который длиннее своего окна, прокручивает страницу, а не холст.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { wheelToPage } from '../../lib/iframe-wheel';

/**
 * Нативный слушатель колеса: d3-zoom холста ловит колесо раньше делегированных событий React.
 *
 * @param bodyRef - тело ноды
 * @param iframeRef - живой iframe
 * @param scrollable - страница длиннее окна
 * @param pageWidth - ширина окна страницы
 */
export function useWheelToPage(
  bodyRef: RefObject<HTMLDivElement | null>,
  iframeRef: RefObject<HTMLIFrameElement | null>,
  scrollable: boolean,
  pageWidth: number,
): void {
  const wheelTarget = useRef({ scrollable: false, pageWidth });
  wheelTarget.current = { scrollable, pageWidth };
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) {
      return;
    }
    const onWheel = (e: WheelEvent) => {
      const frame = iframeRef.current;
      const { scrollable, pageWidth } = wheelTarget.current;
      const msg = frame === null || !scrollable ? null : wheelToPage(e, frame.getBoundingClientRect(), pageWidth);
      if (msg === null || frame === null) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      frame.contentWindow?.postMessage(msg, '*');
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
}
