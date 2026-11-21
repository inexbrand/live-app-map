/**
 * Сообщения между страницей и воркером распознавания.
 */
import type { VoiceDevice, VoiceDtype } from './models';

/** Страница → воркер. */
export type WorkerRequest =
  | {
      readonly type: 'load';
      readonly repo: string;
      readonly device: VoiceDevice;
      readonly dtype: { readonly encoder_model: VoiceDtype; readonly decoder_model_merged: VoiceDtype };
      /** origin визуализатора: модели и wasm берутся только с него. */
      readonly origin: string;
    }
  | { readonly type: 'transcribe'; readonly id: number; readonly audio: Float32Array; readonly language: string };

/** Воркер → страница. */
export type WorkerResponse =
  | { readonly type: 'progress'; readonly file: string; readonly loaded: number; readonly total: number }
  | { readonly type: 'ready'; readonly device: VoiceDevice }
  | { readonly type: 'result'; readonly id: number; readonly text: string }
  | { readonly type: 'error'; readonly id: number | null; readonly error: string };
