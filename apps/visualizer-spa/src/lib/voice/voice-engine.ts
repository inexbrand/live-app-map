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
  if (localStorage.getItem('lam-voice-device') === 'wasm') {
    return 'wasm';
  }
  const gpu: unknown = Reflect.get(navigator, 'gpu');
  if (typeof gpu !== 'object' || gpu === null || !('requestAdapter' in gpu) || typeof gpu.requestAdapter !== 'function') {
    return 'wasm';
  }
  try {
    const adapter: unknown = await gpu.requestAdapter();
    return adapter === null || adapter === undefined ? 'wasm' : 'webgpu';
  } catch {
    return 'wasm';
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
  const files = new Map<string, LoadProgress>();
  loading = new Promise<void>((resolve, reject) => {
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        files.set(msg.file, { loaded: msg.loaded, total: msg.total });
        let l = 0;
        let t = 0;
        for (const f of files.values()) {
          l += f.loaded;
          t += f.total;
        }
        onProgress({ loaded: l, total: t });
      } else if (msg.type === 'ready') {
        loaded = { model, device };
        resolve();
      } else if (msg.type === 'result') {
        waiting.get(msg.id)?.resolve(msg.text);
        waiting.delete(msg.id);
      } else if (msg.id === null) {
        reject(new Error(msg.error));
      } else {
        waiting.get(msg.id)?.reject(new Error(msg.error));
        waiting.delete(msg.id);
      }
    };
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
