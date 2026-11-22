import { describe, expect, test } from 'bun:test';
import { createWhisperHandler, progressOf, textOf, type AsrPipeline, type WhisperDeps } from './whisper-handler';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

/** Воркер без transformers.js: конвейер отвечает заданным текстом, сообщения — в журнал. */
function worker(run: AsrPipeline, progress: unknown[] = [], failLoad: string | null = null) {
  const posted: WorkerResponse[] = [];
  const configured: string[] = [];
  const deps: WhisperDeps = {
    configure: (origin) => configured.push(origin),
    createPipeline: async (_repo, _device, _dtype, onProgress) => {
      progress.forEach(onProgress);
      if (failLoad !== null) {
        throw new Error(failLoad);
      }
      return run;
    },
    post: (msg) => posted.push(msg),
  };
  return { handle: createWhisperHandler(deps), posted, configured };
}

const LOAD: Extract<WorkerRequest, { type: 'load' }> = { type: 'load', repo: 'onnx-community/whisper-base', device: 'wasm', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' }, origin: 'http://localhost:4310' };

async function tick(): Promise<void> {
  await new Promise((r) => setTimeout(r, 5));
}

describe('воркер распознавания', () => {
  test('загрузка: прогресс файлов, прогрев, готово; затем распознавание', async () => {
    const calls: Record<string, unknown>[] = [];
    const w = worker(async (_a, o) => {
      calls.push(o);
      return [{ text: '  привет мир ' }];
    }, [{ status: 'initiate', file: 'x' }, { status: 'progress', file: 'enc.onnx', loaded: 5, total: 10 }, { status: 'progress', file: 'nope' }, null]);
    w.handle(LOAD);
    await tick();
    expect(w.configured).toEqual(['http://localhost:4310']);
    expect(w.posted).toEqual([{ type: 'progress', file: 'enc.onnx', loaded: 5, total: 10 }, { type: 'ready', device: 'wasm' }]);
    expect(calls[0]).toEqual({ language: 'russian', task: 'transcribe' });
    w.handle({ type: 'transcribe', id: 7, audio: new Float32Array(10), language: 'uzbek' });
    await tick();
    expect(w.posted.at(-1)).toEqual({ type: 'result', id: 7, text: 'привет мир' });
    expect(calls[1]).toMatchObject({ language: 'uzbek', chunk_length_s: 30 });
  });

  test('распознавание до загрузки — ошибка запроса; сбой конвейера — ошибка с id', async () => {
    let fail = false;
    const w = worker(async () => {
      if (fail) {
        throw new Error('нет памяти');
      }
      return { text: 'ок' };
    });
    w.handle({ type: 'transcribe', id: 1, audio: new Float32Array(1), language: 'russian' });
    expect(w.posted).toEqual([{ type: 'error', id: 1, error: 'модель ещё не загружена' }]);
    w.handle(LOAD);
    await tick();
    fail = true;
    w.handle({ type: 'transcribe', id: 2, audio: new Float32Array(1), language: 'russian' });
    await tick();
    expect(w.posted.at(-1)).toEqual({ type: 'error', id: 2, error: 'нет памяти' });
  });

  test('модель не загрузилась — ошибка без id', async () => {
    const w = worker(async () => ({ text: '' }), [], 'нет сети');
    w.handle(LOAD);
    await tick();
    expect(w.posted).toEqual([{ type: 'error', id: null, error: 'нет сети' }]);
  });

  test('текст ответа и событие прогресса', () => {
    expect(textOf({ text: ' a ' })).toBe('a');
    expect([textOf([]), textOf(null), textOf({ text: 1 }), textOf('x')]).toEqual(['', '', '', '']);
    expect(progressOf({ status: 'progress', file: 'f', loaded: '1', total: 2 })).toEqual({ type: 'progress', file: 'f', loaded: 1, total: 2 });
    expect([progressOf({ status: 'done' }), progressOf('progress'), progressOf({})]).toEqual([null, null, null]);
  });
});