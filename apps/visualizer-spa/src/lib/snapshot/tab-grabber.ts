/**
 * Захват текущей вкладки через Screen Capture API (getDisplayMedia).
 * В отличие от рисования DOM в canvas, в кадр попадают и cross-origin iframe.
 * Браузер спрашивает разрешение; поток живёт от open() до close().
 */
import { cropForFrame, type Rect } from './region';
import { errorText } from '../error-text';

/** Результат операции захвата. */
export type GrabResult =
  | { readonly ok: true; readonly dataUrl: string; readonly width: number; readonly height: number }
  | { readonly ok: false; readonly error: string };

/** Результат открытия потока. */
export type OpenResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

/** Опции Chrome для захвата своей вкладки (нет в lib.dom TypeScript). */
type TabCaptureOptions = DisplayMediaStreamOptions & {
  readonly preferCurrentTab?: boolean;
  readonly selfBrowserSurface?: 'include' | 'exclude';
};

/** Источник кадров вкладки. */
export type TabGrabber = {
  open(): Promise<OpenResult>;
  grab(rect: Rect): Promise<GrabResult>;
  close(): void;
};

/** Дольше нового кадра не ждём: неподвижная вкладка кадров не шлёт, берём последний. */
const FRAME_WAIT_MS = 250;

async function nextFrame(video: HTMLVideoElement): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 'requestVideoFrameCallback' in video ? FRAME_WAIT_MS : 120);
    if ('requestVideoFrameCallback' in video) {
      video.requestVideoFrameCallback(() => resolve());
    }
  });
}

/**
 * Создаёт захват вкладки браузера.
 *
 * @param doc - document (для video/canvas)
 */
export function createTabGrabber(doc: Document = document): TabGrabber {
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  /** Открытие в процессе: повторный open() ждёт его, а не зовёт второй диалог. */
  let opening: Promise<OpenResult> | null = null;

  const close = (): void => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video = null;
  };

  const openStream = async (): Promise<OpenResult> => {
    const md = navigator.mediaDevices;
    if (md === undefined || typeof md.getDisplayMedia !== 'function') {
      return { ok: false, error: 'браузер не умеет снимать экран (нужен Chrome / Edge / Firefox по https или localhost)' };
    }
    try {
      const options: TabCaptureOptions = {
        video: { displaySurface: 'browser' },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
      };
      stream = await md.getDisplayMedia(options);
      video = doc.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      return { ok: true };
    } catch (err) {
      close();
      return { ok: false, error: errorText(err, 'доступ к экрану не дан') };
    }
  };

  return {
    open() {
      if (stream !== null) {
        return Promise.resolve({ ok: true });
      }
      opening ??= openStream().finally(() => {
        opening = null;
      });
      return opening;
    },

    async grab(rect) {
      if (video === null) {
        return { ok: false, error: 'поток вкладки не открыт' };
      }
      await nextFrame(video);
      const crop = cropForFrame(
        rect,
        { width: window.innerWidth, height: window.innerHeight },
        { width: video.videoWidth, height: video.videoHeight },
      );
      if (crop === null) {
        return { ok: false, error: 'область вне кадра' };
      }
      const canvas = doc.createElement('canvas');
      canvas.width = crop.sw;
      canvas.height = crop.sh;
      const ctx = canvas.getContext('2d');
      if (ctx === null) {
        return { ok: false, error: 'canvas 2d недоступен' };
      }
      ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);
      return { ok: true, dataUrl: canvas.toDataURL('image/png'), width: crop.sw, height: crop.sh };
    },

    close,
  };
}
