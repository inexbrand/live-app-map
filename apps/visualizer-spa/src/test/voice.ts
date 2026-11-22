/**
 * Голос в тестах: вместо «железа» браузера — микрофон и AudioContext, в которые
 * тест подаёт звук, и воркер распознавания, который отвечает по протоколу воркера
 * (worker-protocol): прогресс загрузки, готовность, текст. Код страницы — настоящий.
 */
import type { WorkerRequest, WorkerResponse } from '../lib/voice/worker-protocol';

/** Как ведёт себя воркер распознавания. */
export type FakeWhisper = {
  /** Текст на каждый запрос распознавания (по очереди; кончились — последний). */
  texts: string[];
  /** Ошибка загрузки модели (null — грузится). */
  loadError: string | null;
  /** Ошибка распознавания (null — распознаёт). */
  transcribeError: string | null;
  /** Воркер падает при загрузке (onerror). */
  crash: boolean;
  /** Пауза между сообщениями загрузки, мс. */
  stepMs: number;
};

/** Стенд голоса: что делать воркеру, подача звука, журнал. */
export type VoiceEnv = {
  readonly whisper: FakeWhisper;
  /** Запросы, пришедшие воркеру. */
  readonly requests: WorkerRequest[];
  /** Подать в микрофон столько секунд звука громкостью amp. */
  readonly speak: (seconds: number, amp?: number) => void;
  /** Микрофон запрещён пользователем. */
  denyMic: boolean;
  /** Адреса в Cache Storage браузера (кэш transformers.js). */
  readonly cached: Set<string>;
  /** Остановленные дорожки микрофона. */
  readonly stoppedTracks: () => number;
  restore: () => void;
};

const RATE = 16_000;

/**
 * Ставит стенд голоса.
 *
 * @returns управление стендом
 */
export function installVoiceEnv(): VoiceEnv {
  const requests: WorkerRequest[] = [];
  const whisper: FakeWhisper = { texts: ['привет'], loadError: null, transcribeError: null, crash: false, stepMs: 1 };
  let processor: { onaudioprocess: ((e: { readonly inputBuffer: { getChannelData: (n: number) => Float32Array } }) => void) | null } | null = null;
  let stopped = 0;
  const env: VoiceEnv = {
    whisper,
    requests,
    denyMic: false,
    speak: (seconds, amp = 0.2) => {
      const data = new Float32Array(Math.round(seconds * RATE)).fill(amp);
      processor?.onaudioprocess?.({ inputBuffer: { getChannelData: () => data } });
    },
    cached: new Set(),
    stoppedTracks: () => stopped,
    restore: () => {},
  };

  class FakeWorker {
    onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    private dead = false;
    private emit(msg: WorkerResponse, after = 1): void {
      setTimeout(() => {
        if (!this.dead) {
          this.onmessage?.(new MessageEvent('message', { data: msg }));
        }
      }, after);
    }
    postMessage(req: WorkerRequest): void {
      requests.push(req);
      if (req.type === 'load') {
        this.load();
        return;
      }
      const text = whisper.texts.length > 1 ? (whisper.texts.shift() ?? '') : (whisper.texts[0] ?? '');
      this.emit(whisper.transcribeError === null ? { type: 'result', id: req.id, text } : { type: 'error', id: req.id, error: whisper.transcribeError });
    }
    private load(): void {
      if (whisper.crash) {
        setTimeout(() => this.onerror?.(new ErrorEvent('error', { message: '' })), 1);
        return;
      }
      const step = whisper.stepMs;
      this.emit({ type: 'progress', file: 'encoder.onnx', loaded: 300, total: 1000 }, step);
      this.emit({ type: 'progress', file: 'decoder.onnx', loaded: 100, total: 1000 }, step * 2);
      this.emit(whisper.loadError === null ? { type: 'ready', device: 'wasm' } : { type: 'error', id: null, error: whisper.loadError }, step * 4);
    }
    terminate(): void {
      this.dead = true;
    }
  }

  class FakeAudioContext {
    readonly sampleRate = RATE;
    readonly destination = {};
    createMediaStreamSource() {
      return { connect: () => {}, disconnect: () => {} };
    }
    createScriptProcessor() {
      const p = { onaudioprocess: null, connect: () => {}, disconnect: () => {} };
      processor = p;
      return p;
    }
    close(): Promise<void> {
      return Promise.resolve();
    }
  }

  const cache = {
    match: async (url: string) => (env.cached.has(url) ? new Response('') : undefined),
    keys: async () => [...env.cached].map((url) => new Request(url)),
    delete: async (req: Request) => env.cached.delete(req.url),
  };
  const saved = { caches: Reflect.get(globalThis, 'caches'), worker: Reflect.get(globalThis, 'Worker'), audio: Reflect.get(globalThis, 'AudioContext'), media: Reflect.get(navigator, 'mediaDevices') };
  Reflect.set(globalThis, 'caches', { open: async () => cache });
  Reflect.set(globalThis, 'Worker', FakeWorker);
  Reflect.set(globalThis, 'AudioContext', FakeAudioContext);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: async () => {
        if (env.denyMic) {
          throw new DOMException('нет доступа', 'NotAllowedError');
        }
        return { getTracks: () => [{ stop: () => { stopped++; } }] };
      },
    },
  });
  env.restore = () => {
    Reflect.set(globalThis, 'caches', saved.caches);
    Reflect.set(globalThis, 'Worker', saved.worker);
    Reflect.set(globalThis, 'AudioContext', saved.audio);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: saved.media });
  };
  return env;
}
