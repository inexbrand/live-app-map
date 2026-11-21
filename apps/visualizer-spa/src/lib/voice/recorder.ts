/**
 * Запись с микрофона в моно 16 кГц для Whisper.
 */
import { resampleLinear, WHISPER_SAMPLE_RATE } from './models';

/** Идущая запись. */
export type Recording = {
  /** Всё записанное до сих пор, 16 кГц. */
  samples(): Float32Array;
  /** Громкость последнего куска, 0…1. */
  level(): number;
  /** Остановить и отдать запись. */
  stop(): Float32Array;
};

function concat(chunks: readonly Float32Array[]): Float32Array {
  let n = 0;
  for (const c of chunks) {
    n += c.length;
  }
  const out = new Float32Array(n);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/**
 * Начинает запись; браузер спросит доступ к микрофону.
 *
 * @throws Error если микрофона нет или доступ не дан
 */
export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  let ctx: AudioContext;
  try {
    ctx = new AudioContext({ sampleRate: WHISPER_SAMPLE_RATE });
  } catch {
    ctx = new AudioContext();
  }
  const rate = ctx.sampleRate;
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor проще AudioWorklet и есть во всех браузерах; задержка 0,25 с не мешает.
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let last = 0;
  proc.onaudioprocess = (e) => {
    const data = new Float32Array(e.inputBuffer.getChannelData(0));
    chunks.push(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += (data[i] ?? 0) * (data[i] ?? 0);
    }
    last = Math.min(1, Math.sqrt(sum / Math.max(1, data.length)) * 4);
  };
  source.connect(proc);
  proc.connect(ctx.destination);
  const samples = (): Float32Array => resampleLinear(concat(chunks), rate, WHISPER_SAMPLE_RATE);
  return {
    samples,
    level: () => last,
    stop: () => {
      proc.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
      return samples();
    },
  };
}
