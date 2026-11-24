/**
 * Фокус выбранной ноды. Экран — камера ставит его в центр целиком по высоте
 * окна (не крупнее 1:1); длинная страница, которая по высоте стала бы мелкой, —
 * 1:1 по ширине от верха. Сервис — холст сдвигается из-под панелей (масштаб тот же).
 */
import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useAppStore } from '../store/app-store';
import { revealShift, type DockedPanel, type ScreenRect } from './reveal';

const GAP = 16;
/** Наибольший масштаб холста: фокус вписывает экран в высоту окна до него. */
export const MAX_ZOOM = 1.5;

/** Место сверху (шапка) и снизу (плашка фокуса) при подгонке экрана. */
const TOP_RESERVE = 72;
const BOTTOM_RESERVE = 88;
/** Мельче этого масштаба длинная страница не ужимается — показывается 1:1 от верха. */
const MIN_READABLE_ZOOM = 0.55;

/**
 * Камера фокуса экрана: масштаб и центр на сцене.
 *
 * @param node - позиция и размер ноды на сцене
 * @param view - размер холста
 */
export function focusCamera(node: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }, view: { readonly width: number; readonly height: number }): { readonly x: number; readonly y: number; readonly zoom: number } {
  const availH = Math.max(120, view.height - TOP_RESERVE - BOTTOM_RESERVE);
  const availW = Math.max(120, view.width - 2 * GAP);
  const fit = Math.min(MAX_ZOOM, availH / node.h, availW / node.w);
  const cx = node.x + node.w / 2;
  if (fit >= MIN_READABLE_ZOOM) {
    // Центр чуть ниже середины окна: сверху шапка меньше плашки снизу — сдвиг на половину разницы
    return { x: cx, y: node.y + node.h / 2 + (BOTTOM_RESERVE - TOP_RESERVE) / 2 / fit, zoom: fit };
  }
  const zoom = Math.min(MAX_ZOOM, availW / node.w);
  return { x: cx, y: node.y + (view.height / 2 - TOP_RESERVE) / zoom, zoom };
}

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

type Flow = ReturnType<typeof useReactFlow>;

/** Размер ноды: измеренный, иначе заданный. */
function sizeOf(node: { readonly measured?: { readonly width?: number; readonly height?: number }; readonly width?: number; readonly height?: number }): { readonly w: number; readonly h: number } {
  return { w: node.measured?.width ?? node.width ?? 0, h: node.measured?.height ?? node.height ?? 0 };
}

/** Нода вне экрана (холст рисует только видимые): центр холста — на её координаты. */
function centerOnNode(flow: Flow, id: string): void {
  const node = flow.getNode(id);
  if (node === undefined) {
    return;
  }
  const { w, h } = sizeOf(node);
  void flow.setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom: flow.getViewport().zoom, duration: 300 });
}

/** Нода на экране: сдвиг холста из-под панелей, масштаб тот же. */
function revealNode(flow: Flow, id: string): void {
  const el = document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
  if (el === null) {
    centerOnNode(flow, id);
    return;
  }
  const { dx, dy } = revealShift(rectOf(el), dockedPanels(), GAP);
  if (dx !== 0 || dy !== 0) {
    const vp = flow.getViewport();
    void flow.setViewport({ x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom }, { duration: 200 });
  }
}

/** Экран в фокус: камера по focusCamera. */
function focusNode(flow: Flow, id: string): void {
  const node = flow.getNode(id);
  const pane = document.querySelector('.react-flow');
  if (node === undefined || pane === null) {
    return;
  }
  const { w, h } = sizeOf(node);
  const r = pane.getBoundingClientRect();
  const cam = focusCamera({ x: node.position.x, y: node.position.y, w, h }, { width: r.width, height: r.height });
  void flow.setCenter(cam.x, cam.y, { zoom: cam.zoom, duration: 320 });
}

/** Ставит выбранную ноду в фокус (компонент внутри ReactFlow). */
export function RevealSelected() {
  const selectedPageId = useAppStore((s) => s.selectedPageId);
  const isPage = useAppStore((s) => (s.selectedPageId === null ? false : s.index?.nodesById.get(s.selectedPageId)?.kind === 'page'));
  const flow = useReactFlow();
  useEffect(() => {
    if (selectedPageId === null) {
      return undefined;
    }
    // Два кадра: панели выбора и полоса размеров успевают смонтироваться.
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => (isPage ? focusNode(flow, selectedPageId) : revealNode(flow, selectedPageId)));
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedPageId, isPage, flow]);
  return null;
}