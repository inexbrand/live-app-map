/**
 * Выбранная нода не остаётся под панелями: после выбора холст сдвигается
 * так, чтобы она легла в просвет между ними (масштаб не меняется).
 */
import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useAppStore } from '../store/app-store';
import { revealShift, type DockedPanel, type ScreenRect } from './reveal';

const GAP = 16;

function rectOf(el: Element): ScreenRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

/** Панели поверх холста: шапка и боковые панели. */
function dockedPanels(): DockedPanel[] {
  const panels: DockedPanel[] = [];
  document.querySelectorAll('.toolbar').forEach((el) => panels.push({ rect: rectOf(el), side: 'top' }));
  document.querySelectorAll('.drawer').forEach((el) => panels.push({ rect: rectOf(el), side: el.classList.contains('drawer--left') ? 'left' : 'right' }));
  return panels;
}

/** Сдвигает холст к выбранной ноде (компонент внутри ReactFlow). */
export function RevealSelected() {
  const selectedPageId = useAppStore((s) => s.selectedPageId);
  const flow = useReactFlow();
  useEffect(() => {
    if (selectedPageId === null) {
      return undefined;
    }
    // Два кадра: панели выбора и полоса размеров успевают смонтироваться.
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        const el = document.querySelector(`.react-flow__node[data-id="${CSS.escape(selectedPageId)}"]`);
        if (el === null) {
          return;
        }
        const { dx, dy } = revealShift(rectOf(el), dockedPanels(), GAP);
        if (dx !== 0 || dy !== 0) {
          const vp = flow.getViewport();
          void flow.setViewport({ x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom }, { duration: 200 });
        }
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedPageId, flow]);
  return null;
}
