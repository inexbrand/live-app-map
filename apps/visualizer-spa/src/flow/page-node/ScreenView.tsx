/**
 * Экран ноды из трансляции: живой и тёплый — canvas с кадрами сервера; не
 * смонтированный — картинка последнего кадра (декодируется асинхронно); кадров
 * ещё не было — снимок шлюза. Мышь и клавиши уходят в страницу, когда включено
 * взаимодействие или выбор элемента.
 */
import type { DeviceViewport } from '@live-app-map/schema';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { NodeLayoutMetrics } from '../../lib/node-layout';
import { streamClient } from '../../lib/stream/stream-client';
import { toPagePoint, type MouseInput } from '../../lib/stream/stream-protocol';

/** Атрибут холста экрана с id ноды: по нему пикер находит коробку экрана. */
export const SCREEN_ATTR = 'data-lam-screen';

/** Props экрана. */
export type ScreenViewProps = {
  readonly nodeId: string;
  readonly title: string;
  readonly viewport: DeviceViewport;
  readonly layout: NodeLayoutMetrics;
  /** Страница открыта на сервере (живой или тёплый экран). */
  readonly mounted: boolean;
  /** Мышь и клавиши уходят в страницу. */
  readonly interactive: boolean;
  /** Снимок шлюза, пока кадров нет; null — нет. */
  readonly snapshot: string | null;
  readonly onSnapshotError: () => void;
};

/** Окно страницы в масштабе ноды. */
function pageStyle(viewport: DeviceViewport, layout: NodeLayoutMetrics): CSSProperties {
  return { position: 'absolute', top: 0, left: 0, width: viewport.width, height: viewport.height, transform: `scale(${layout.iframeScaleX}, ${layout.iframeScaleY})`, transformOrigin: '0 0' };
}

const BUTTONS: readonly MouseInput['button'][] = ['left', 'middle', 'right'];

/** Рисует кадры на холсте: последний кадр сразу, новые — по одному на кадр экрана. */
function useFrames(nodeId: string, canvas: HTMLCanvasElement | null, onFirst: () => void): void {
  useEffect(() => {
    if (canvas === null) {
      return;
    }
    const g = canvas.getContext('2d');
    let pending: Blob | null = null;
    let busy = false;
    let alive = true;
    const draw = async (): Promise<void> => {
      busy = true;
      while (pending !== null && alive) {
        const blob = pending;
        pending = null;
        const bmp = await createImageBitmap(blob).catch(() => null);
        if (bmp !== null && alive) {
          g?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
          onFirst();
        }
        bmp?.close();
      }
      busy = false;
    };
    const take = (blob: Blob): void => {
      pending = blob;
      if (!busy) {
        void draw();
      }
    };
    const last = streamClient.lastFrame(nodeId);
    if (last !== null) {
      take(last);
    }
    const off = streamClient.onFrame(nodeId, take);
    return () => {
      alive = false;
      off();
    };
  }, [nodeId, canvas, onFirst]);
}

/** Холсты, на которых нажатие началось при включённом вводе (отпускание без нажатия — чужое). */
const pressed = new WeakSet<HTMLCanvasElement>();

/** Обработчики ввода холста: точка экрана → точка страницы. */
function inputHandlers(nodeId: string, viewport: DeviceViewport) {
  const mouse = (type: MouseInput['type'], e: PointerEvent<HTMLCanvasElement>): void => {
    const p = toPagePoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), viewport);
    streamClient.input(nodeId, { kind: 'mouse', type, x: p.x, y: p.y, button: BUTTONS[e.button] ?? 'left', clickCount: type === 'move' ? 0 : Math.max(1, e.detail) });
  };
  const key = (type: 'down' | 'up', e: KeyboardEvent<HTMLCanvasElement>): void => {
    // Клавиши — странице, а не горячим клавишам карты и не прокрутке вкладки
    e.preventDefault();
    e.stopPropagation();
    streamClient.input(nodeId, { kind: 'key', type, key: e.key });
  };
  return {
    onPointerDown: (e: PointerEvent<HTMLCanvasElement>) => {
      e.stopPropagation();
      e.currentTarget.focus();
      e.currentTarget.setPointerCapture(e.pointerId);
      pressed.add(e.currentTarget);
      mouse('down', e);
    },
    onPointerMove: (e: PointerEvent<HTMLCanvasElement>) => mouse('move', e),
    onPointerUp: (e: PointerEvent<HTMLCanvasElement>) => {
      e.stopPropagation();
      // Клик, который выбрал экран, начался до включения ввода — в страницу не уходит
      if (pressed.delete(e.currentTarget)) {
        mouse('up', e);
      }
    },
    onKeyDown: (e: KeyboardEvent<HTMLCanvasElement>) => key('down', e),
    onKeyUp: (e: KeyboardEvent<HTMLCanvasElement>) => key('up', e),
  };
}

/** Картинка последнего кадра или снимка. */
function Picture({ src, title, style, onError }: { readonly src: string; readonly title: string; readonly style: CSSProperties; readonly onError?: () => void }) {
  return <img data-lam-snapshot className="page-node__snapshot" src={src} alt={`Экран: ${title}`} decoding="async" draggable={false} onError={onError} style={style} />;
}

/**
 * Экран ноды.
 *
 * @param props - нода, окно, масштаб, смонтирован ли, ввод, снимок
 */
export function ScreenView(props: ScreenViewProps) {
  const { nodeId, title, viewport, layout, mounted, interactive, snapshot, onSnapshotError } = props;
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [drawn, setDrawn] = useState(() => streamClient.lastFrame(nodeId) !== null);
  const onFirst = useRef(() => setDrawn(true)).current;
  useFrames(nodeId, mounted ? canvas : null, onFirst);
  const style = pageStyle(viewport, layout);
  const lastUrl = mounted ? null : streamClient.frameUrl(nodeId);
  const under = !drawn && snapshot !== null ? <Picture src={snapshot} title={title} style={style} onError={onSnapshotError} /> : null;
  return (
    <div className="page-node__screen-shell" style={{ width: layout.contentWidth, height: layout.contentHeight }}>
      {mounted ? (
        <>
          {under}
          <canvas
            ref={setCanvas}
            {...{ [SCREEN_ATTR]: nodeId }}
            width={viewport.width}
            height={viewport.height}
            tabIndex={interactive ? 0 : -1}
            className={`page-node__screen${interactive ? ' page-node__screen--interact nodrag nopan' : ''}`}
            style={{ ...style, pointerEvents: interactive ? 'auto' : 'none', opacity: drawn ? 1 : 0 }}
            {...(interactive ? inputHandlers(nodeId, viewport) : {})}
          />
        </>
      ) : lastUrl !== null ? (
        <Picture src={lastUrl} title={title} style={style} />
      ) : snapshot !== null ? (
        <Picture src={snapshot} title={title} style={style} onError={onSnapshotError} />
      ) : (
        <div className="page-node__placeholder" role="status">
          Экран оживёт, когда попадёт в кадр
        </div>
      )}
    </div>
  );
}
