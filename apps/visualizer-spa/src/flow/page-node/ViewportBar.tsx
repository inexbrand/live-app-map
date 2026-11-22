/**
 * Панель окна выбранной ноды: пресеты ширины и «целиком» (страница во всю высоту).
 */
import type { DeviceViewport } from '@live-app-map/schema';
import { Smartphone } from 'lucide-react';
import type { ViewportPreset } from '../../lib/viewport';

/** Props панели окна. */
export type ViewportBarProps = {
  readonly viewport: DeviceViewport;
  readonly presets: readonly ViewportPreset[];
  readonly applyPreset: (p: ViewportPreset) => void;
  /** «Целиком» ↔ окно с прокруткой. */
  readonly toggleFullHeight: () => void;
};

/**
 * Панель окна.
 *
 * @param props - окно, пресеты и действия
 */
export function ViewportBar(props: ViewportBarProps) {
  const { viewport, presets: widthPresets, applyPreset, toggleFullHeight } = props;
  return (
    <div
      className="page-node__viewport-bar"
      onClick={(e) => e.stopPropagation()}
    >
      <Smartphone size={12} strokeWidth={1.75} aria-hidden={true} />
      {widthPresets.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`page-node__vp-btn${
            viewport.width === p.width ? ' page-node__vp-btn--on' : ''
          }`}
          title={`${p.label} · ${p.width}px · height ${p.heightMode ?? 'auto'}`}
          onClick={() => applyPreset(p)}
        >
          {p.label}
        </button>
      ))}
      {/* Целиком — нода растёт до высоты страницы; окно — фиксированная высота, страница прокручивается внутри (двойной клик — взаимодействие). */}
      <button
        type="button"
        className={`page-node__vp-btn${viewport.heightMode === 'auto' ? ' page-node__vp-btn--on' : ''}`}
        aria-pressed={viewport.heightMode === 'auto'}
        data-lam-full-height
        title={viewport.heightMode === 'auto' ? 'Сейчас: страница целиком. Нажмите — окно с прокруткой' : 'Сейчас: окно с прокруткой. Нажмите — страница целиком'}
        onClick={toggleFullHeight}
      >
        целиком
      </button>
    </div>
  );
}
