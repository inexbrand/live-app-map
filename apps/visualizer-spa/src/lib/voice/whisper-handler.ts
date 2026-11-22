/**
 * Логика воркера распознавания без transformers.js: загрузка модели с прогрессом,
 * прогрев, распознавание по запросам страницы. Сам воркер (whisper-worker) только
 * подключает transformers.js и почту воркера.
 */
import type { VoiceDevice, VoiceDtype } from './models';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

/** Распознавание: звук 16 кГц и параметры Whisper → ответ transformers.js. */
export type AsrPipeline = (audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>;

/** Что воркер даёт логике: настройку источников, создание конвейера и отправку сообщений. */
export type WhisperDeps = {
  /** Модели и wasm — только с dev-сервера визуализатора. */
  readonly configure: (origin: string) => void;
  readonly createPipeline: (
    repo: string,
    device: VoiceDevice,
    dtype: { readonly encoder_model: VoiceDtype; readonly decoder_model_merged: VoiceDtype },
    onProgress: (p: unknown) => void,
  ) => Promise<AsrPipeline>;
  readonly post: (msg: WorkerResponse) => void;
};

/**
 * Текст из ответа конвейера (объект или массив объектов с text).
 *
 * @param out - ответ transformers.js
 */
export function textOf(out: unknown): string {
  const one: unknown = Array.isArray(out) ? out[0] : out;
  const text: unknown = typeof one === 'object' && one !== null ? Reflect.get(one, 'text') : undefined;
  return typeof text === 'string' ? text.trim() : '';
}

/**
 * Сообщение о прогрессе по событию загрузки transformers.js; остальные события — null.
 *
 * @param p - событие progress_callback
 */
export function progressOf(p: unknown): WorkerResponse | null {
  if (typeof p !== 'object' || p === null || !('status' in p) || p.status !== 'progress') {
    return null;
  }
  return 'file' in p && 'loaded' in p && 'total' in p ? { type: 'progress', file: String(p.file), loaded: Number(p.loaded), total: Number(p.total) } : null;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Обработчик запросов страницы.
 *
 * @param deps - transformers.js и почта воркера
 * @returns функция на каждый запрос
 */
export function createWhisperHandler(deps: WhisperDeps): (req: WorkerRequest) => void {
  let asr: AsrPipeline | null = null;
  const load = async (req: Extract<WorkerRequest, { type: 'load' }>): Promise<void> => {
    deps.configure(req.origin);
    const run = await deps.createPipeline(req.repo, req.device, req.dtype, (p) => {
      const msg = progressOf(p);
      if (msg !== null) {
        deps.post(msg);
      }
    });
    asr = run;
    // Прогрев: первый проход компилирует шейдеры/ядра, иначе первая фраза ждёт
    await run(new Float32Array(16_000), { language: 'russian', task: 'transcribe' });
    deps.post({ type: 'ready', device: req.device });
  };
  return (req) => {
    if (req.type === 'load') {
      load(req).catch((err: unknown) => deps.post({ type: 'error', id: null, error: errorText(err) }));
      return;
    }
    const run = asr;
    if (run === null) {
      deps.post({ type: 'error', id: req.id, error: 'модель ещё не загружена' });
      return;
    }
    run(req.audio, { language: req.language, task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 })
      .then((out) => deps.post({ type: 'result', id: req.id, text: textOf(out) }))
      .catch((err: unknown) => deps.post({ type: 'error', id: req.id, error: errorText(err) }));
  };
}