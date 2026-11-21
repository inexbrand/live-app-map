/**
 * Выбранная нода не остаётся под панелями: после выбора холст сдвигается
 * так, чтобы она легла в просвет между ними (масштаб не меняется). Нода вне экрана
 * (холст рисует только видимые) — сначала в центр, по её координатам на сцене.
 */
import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useAppStore } from '../store/app-store';
import { useCommentsStore } from '../store/comments-store';
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
  // Левая панель веток экрана появляется после выбора (ветки грузятся) — сдвинуть ещё раз
  const leftPanel = useCommentsStore((s) => !s.listOpen && s.threads.some((t) => t.anchor.pageId === selectedPageId));
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
          const node = flow.getNode(selectedPageId);
          if (node !== undefined) {
            const w = node.measured?.width ?? node.width ?? 0;
            const h = node.measured?.height ?? node.height ?? 0;
            void flow.setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom: flow.getViewport().zoom, duration: 300 });
          }
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
  }, [selectedPageId, leftPanel, flow]);
  return null;
}
