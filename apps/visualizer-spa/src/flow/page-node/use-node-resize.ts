/**
 * Ручка размера ноды: ширина тянется, высота auto переизмеряется; Shift — свободная высота (fixed).
 */
import type { DeviceViewport } from '@live-app-map/schema';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useAppStore } from '../../store/app-store';

/**
 * Обработчик нажатия на ручку размера.
 *
 * @param nodeId - id ноды
 * @param viewport - текущее окно
 * @param scale - масштаб холста
 * @param remeasure - переизмерить высоту после отпускания
 */
export function useNodeResize(
  nodeId: string,
  viewport: DeviceViewport,
  scale: number,
  remeasure: () => void,
): (e: ReactPointerEvent<HTMLDivElement>) => void {
  const setNodeViewport = useAppStore((s) => s.setNodeViewport);
  const applyMeasuredHeight = remeasure;
  /** Resize по ширине; высота auto переизмеряется. Shift — free height (fixed). */
  return (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = viewport.width;
    const startH = viewport.height;
    const freeHeight = e.shiftKey;
    const pointerId = e.pointerId;
    const target = e.currentTarget;
    target.setPointerCapture(pointerId);

    const onMove = (ev: PointerEvent) => {
      const dw = (ev.clientX - startX) / scale;
      const nextW = Math.max(200, Math.min(2560, startW + dw));
      if (freeHeight) {
        const dh = (ev.clientY - startY) / scale;
        setNodeViewport(nodeId, {
          width: Math.round(nextW),
          height: Math.max(120, startH + dh),
          label: 'Свой',
          heightMode: 'fixed',
        });
        return;
      }
      setNodeViewport(nodeId, {
        width: Math.round(nextW),
        height: viewport.height,
        label: String(Math.round(nextW)),
        heightMode: 'auto',
      });
    };
    const onUp = () => {
      target.releasePointerCapture(pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.setTimeout(() => applyMeasuredHeight(), 200);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
}
