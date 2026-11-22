/**
 * Распознавание речи на странице: один воркер Whisper на вкладку.
 */
import { voiceDtype, voiceModel, type VoiceDevice, type VoiceModelId } from './models';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

/** Прогресс загрузки модели, байты. */
export type LoadProgress = { readonly loaded: number; readonly total: number };

let worker: Worker | null = null;
let loaded: { readonly model: VoiceModelId; readonly device: VoiceDevice } | null = null;
let loading: Promise<void> | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>();

function send(req: WorkerRequest): void {
  worker?.postMessage(req);
}

/**
 * Где считать: WebGPU, если браузер дал адаптер, иначе WASM.
 * `localStorage['lam-voice-device'] = 'wasm'` — принудительно процессор.
 */
export async function detectVoiceDevice(): Promise<VoiceDevice> {
  const requestAdapter = gpuAdapterRequest();
  if (localStorage.getItem('lam-voice-device') === 'wasm' || requestAdapter === null) {
    return 'wasm';
  }
  try {
    const adapter: unknown = await requestAdapter();
    return adapter === null || adapter === undefined ? 'wasm' : 'webgpu';
  } catch {
    return 'wasm';
  }
}

/** navigator.gpu.requestAdapter, если браузер умеет WebGPU. */
function gpuAdapterRequest(): (() => Promise<unknown>) | null {
  const gpu: unknown = Reflect.get(navigator, 'gpu');
  if (typeof gpu !== 'object' || gpu === null || !('requestAdapter' in gpu)) {
    return null;
  }
  const request: unknown = gpu.requestAdapter;
  return typeof request === 'function' ? () => Promise.resolve(Reflect.apply(request, gpu, [])) : null;
}

/** Сумма прогресса по файлам модели. */
function totalProgress(files: ReadonlyMap<string, LoadProgress>): LoadProgress {
  let loaded = 0;
  let total = 0;
  for (const f of files.values()) {
    loaded += f.loaded;
    total += f.total;
  }
  return { loaded, total };
}

/** Ответ на распознавание: отдать текст или ошибку тому, кто ждёт. */
function settleWaiting(id: number, outcome: { readonly text: string } | { readonly error: string }): void {
  const w = waiting.get(id);
  waiting.delete(id);
  if ('text' in outcome) {
    w?.resolve(outcome.text);
  } else {
    w?.reject(new Error(outcome.error));
  }
}

/** Как загрузка ждёт воркер: прогресс по файлам, готово, ошибка загрузки. */
type LoadWait = {
  readonly files: Map<string, LoadProgress>;
  readonly onProgress: (p: LoadProgress) => void;
  readonly ready: () => void;
  readonly fail: (e: Error) => void;
};

/** Сообщение воркера. */
function onWorkerMessage(msg: WorkerResponse, wait: LoadWait): void {
  switch (msg.type) {
    case 'progress':
      wait.files.set(msg.file, { loaded: msg.loaded, total: msg.total });
      wait.onProgress(totalProgress(wait.files));
      return;
    case 'ready':
      wait.ready();
      return;
    case 'result':
      settleWaiting(msg.id, { text: msg.text });
      return;
    case 'error':
      if (msg.id === null) {
        wait.fail(new Error(msg.error));
      } else {
        settleWaiting(msg.id, { error: msg.error });
      }
  }
}

/**
 * Загружает модель (скачивает при первом разе). Повторный вызов с той же
 * моделью ждёт ту же загрузку.
 *
 * @param model - модель
 * @param device - устройство
 * @param onProgress - сумма загруженного по файлам
 */
export function loadVoiceModel(model: VoiceModelId, device: VoiceDevice, onProgress: (p: LoadProgress) => void): Promise<void> {
  if (loaded !== null && loaded.model === model && loaded.device === device) {
    return Promise.resolve();
  }
  if (loading !== null) {
    return loading;
  }
  disposeVoiceEngine();
  const w = new Worker(new URL('./whisper-worker.ts', import.meta.url), { type: 'module' });
  worker = w;
  loading = new Promise<void>((resolve, reject) => {
    const wait: LoadWait = {
      files: new Map(),
      onProgress,
      ready: () => {
        loaded = { model, device };
        resolve();
      },
      fail: reject,
    };
    w.onmessage = (e: MessageEvent<WorkerResponse>) => onWorkerMessage(e.data, wait);
    w.onerror = (e) => reject(new Error(e.message || 'воркер распознавания упал'));
  }).finally(() => {
    loading = null;
  });
  send({ type: 'load', repo: voiceModel(model).repo, device, dtype: voiceDtype(model, device), origin: location.origin });
  return loading;
}

/** Модель загружена и готова распознавать. */
export function isVoiceModelLoaded(): boolean {
  return loaded !== null;
}

/**
 * Распознаёт звук 16 кГц моно.
 *
 * @param audio - сэмплы
 * @param language - язык для Whisper (russian, uzbek, english)
 */
export function transcribe(audio: Float32Array, language: string): Promise<string> {
  if (worker === null || loaded === null) {
    return Promise.reject(new Error('модель не загружена'));
  }
  const id = nextId++;
  return new Promise<string>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    send({ type: 'transcribe', id, audio, language });
  });
}

/** Останавливает воркер (удаление модели, смена модели). */
export function disposeVoiceEngine(): void {
  worker?.terminate();
  worker = null;
  loaded = null;
  for (const w of waiting.values()) {
    w.reject(new Error('распознавание остановлено'));
  }
  waiting.clear();
}
