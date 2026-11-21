/**
 * Воркер распознавания речи: Whisper через transformers.js (WebGPU или WASM).
 * Модели и wasm onnxruntime берутся только с dev-сервера визуализатора
 * (/__lam_models), звук из воркера никуда не уходит.
 */
import { env, pipeline } from '@huggingface/transformers';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

type Asr = (audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>;

let asr: Asr | null = null;

function post(msg: WorkerResponse): void {
  self.postMessage(msg);
}

function textOf(out: unknown): string {
  const one = Array.isArray(out) ? out[0] : out;
  return typeof one === 'object' && one !== null && 'text' in one && typeof one.text === 'string' ? one.text.trim() : '';
}

async function load(req: Extract<WorkerRequest, { type: 'load' }>): Promise<void> {
  env.allowLocalModels = false;
  env.remoteHost = `${req.origin}/__lam_models/hf/`;
  const wasm = env.backends.onnx.wasm;
  if (wasm !== undefined) {
    wasm.wasmPaths = {
      mjs: `${req.origin}/__lam_models/ort/ort-wasm-simd-threaded.asyncify.mjs`,
      wasm: `${req.origin}/__lam_models/ort/ort-wasm-simd-threaded.asyncify.wasm`,
    };
  }
  const run = await pipeline('automatic-speech-recognition', req.repo, {
    device: req.device,
    dtype: req.dtype,
    progress_callback: (p: unknown) => {
      if (typeof p === 'object' && p !== null && 'status' in p && p.status === 'progress' && 'file' in p && 'loaded' in p && 'total' in p) {
        post({ type: 'progress', file: String(p.file), loaded: Number(p.loaded), total: Number(p.total) });
      }
    },
  });
  asr = (audio, options) => run(audio, options);
  // Прогрев: первый проход компилирует шейдеры/ядра, иначе первая фраза ждёт
  await asr(new Float32Array(16_000), { language: 'russian', task: 'transcribe' });
  post({ type: 'ready', device: req.device });
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  if (req.type === 'load') {
    load(req).catch((err: unknown) => post({ type: 'error', id: null, error: err instanceof Error ? err.message : String(err) }));
    return;
  }
  const run = asr;
  if (run === null) {
    post({ type: 'error', id: req.id, error: 'модель ещё не загружена' });
    return;
  }
  run(req.audio, { language: req.language, task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 })
    .then((out) => post({ type: 'result', id: req.id, text: textOf(out) }))
    .catch((err: unknown) => post({ type: 'error', id: req.id, error: err instanceof Error ? err.message : String(err) }));
};
