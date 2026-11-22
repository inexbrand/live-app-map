/**
 * Воркер распознавания речи: Whisper через transformers.js (WebGPU или WASM).
 * Модели и wasm onnxruntime берутся только с dev-сервера визуализатора
 * (/__lam_models), звук из воркера никуда не уходит. Логика — whisper-handler.
 */
import { env, pipeline } from '@huggingface/transformers';
import { createWhisperHandler } from './whisper-handler';
import type { WorkerRequest } from './worker-protocol';

const handle = createWhisperHandler({
  configure: (origin) => {
    env.allowLocalModels = false;
    env.remoteHost = `${origin}/__lam_models/hf/`;
    const wasm = env.backends.onnx.wasm;
    if (wasm !== undefined) {
      wasm.wasmPaths = {
        mjs: `${origin}/__lam_models/ort/ort-wasm-simd-threaded.asyncify.mjs`,
        wasm: `${origin}/__lam_models/ort/ort-wasm-simd-threaded.asyncify.wasm`,
      };
    }
  },
  createPipeline: async (repo, device, dtype, onProgress) => {
    const run = await pipeline('automatic-speech-recognition', repo, { device, dtype, progress_callback: onProgress });
    return (audio, options) => run(audio, options);
  },
  post: (msg) => self.postMessage(msg),
});

self.onmessage = (e: MessageEvent<WorkerRequest>) => handle(e.data);
