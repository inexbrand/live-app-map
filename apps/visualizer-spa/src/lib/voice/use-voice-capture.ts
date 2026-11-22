/**
 * «Держи и говори»: запись, живой черновик раз в ~1,2 с и итоговый текст.
 * Если модели нет — открывает окно согласия на скачивание и не пишет.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoiceStore } from '../../store/voice-store';
import { whisperLanguage } from './models';
import { startRecording, type Recording } from './recorder';
import { isVoiceModelLoaded, transcribe } from './voice-engine';

/** Состояние записи. */
export type VoiceCapture = {
  readonly recording: boolean;
  /** Идёт итоговое распознавание. */
  readonly finishing: boolean;
  /** Живой черновик сказанного. */
  readonly draft: string;
  /** Громкость, 0…1. */
  readonly level: number;
  readonly error: string | null;
  readonly start: () => void;
  readonly stop: () => void;
  readonly cancel: () => void;
};

const DRAFT_EVERY_MS = 1200;
/** Короче — это не речь, а случайный клик. */
const MIN_SAMPLES = 16_000 * 0.3;

/** Куда хук пишет состояние записи. */
type CaptureSetters = {
  readonly setRecording: (v: boolean) => void;
  readonly setFinishing: (v: boolean) => void;
  readonly setDraft: (v: string) => void;
  readonly setLevel: (v: number) => void;
  readonly setError: (v: string | null) => void;
};

/** Текст ошибки записи: отказ в доступе к микрофону — словами. */
function micErrorText(err: unknown): string {
  if (err instanceof DOMException && err.name === 'NotAllowedError') {
    return 'Нет доступа к микрофону';
  }
  return err instanceof Error ? err.message : String(err);
}

/** Модель готова к распознаванию: загружена или загрузилась сейчас. */
async function ensureModel(): Promise<void> {
  if (!isVoiceModelLoaded() && !(await useVoiceStore.getState().load())) {
    throw new Error(useVoiceStore.getState().error ?? 'модель не загрузилась');
  }
}

/**
 * Остановить запись; keep — распознать (слишком короткая — не речь, а случайный клик).
 *
 * @returns итоговый текст или null (нечего вставлять)
 */
async function finishRecording(r: Recording, keep: boolean, ui: CaptureSetters): Promise<string | null> {
  const audio = r.stop();
  ui.setRecording(false);
  ui.setLevel(0);
  if (!keep || audio.length < MIN_SAMPLES) {
    ui.setDraft('');
    return null;
  }
  ui.setFinishing(true);
  try {
    await ensureModel();
    const text = await transcribe(audio, whisperLanguage(useVoiceStore.getState().language));
    return text === '' ? null : text;
  } catch (err) {
    ui.setError(err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    ui.setDraft('');
    ui.setFinishing(false);
  }
}

/**
 * Открыть микрофон, если модель есть; нет модели — окно согласия на скачивание.
 *
 * @returns запись или null (открыто окно модели)
 */
async function openRecording(): Promise<Recording | null> {
  // Сразу после открытия страницы ещё неизвестно, лежит ли модель на диске
  if (useVoiceStore.getState().present === null && useVoiceStore.getState().phase !== 'ready') {
    await useVoiceStore.getState().inspect();
  }
  const voice = useVoiceStore.getState();
  if (voice.present !== true && voice.phase !== 'ready') {
    voice.setDialog(true);
    return null;
  }
  if (!isVoiceModelLoaded() && voice.phase !== 'downloading') {
    // Модель на диске или в кэше: грузим, пока человек говорит
    void voice.load();
  }
  return startRecording();
}

/** Шаг живого черновика: распознать записанное, пока запись та же; занятость — в busy. */
function draftTick(rec: { readonly current: Recording | null }, busy: { current: boolean }, setDraft: (t: string) => void): void {
  const r = rec.current;
  if (r === null || busy.current || !isVoiceModelLoaded()) {
    return;
  }
  const audio = r.samples();
  if (audio.length < MIN_SAMPLES) {
    return;
  }
  busy.current = true;
  transcribe(audio, whisperLanguage(useVoiceStore.getState().language))
    .then((t) => {
      if (rec.current === r) {
        setDraft(t);
      }
    })
    .catch(() => undefined)
    .finally(() => {
      busy.current = false;
    });
}

/** Пока идёт запись: громкость раз в 100 мс и черновик раз в ~1,2 с. */
function useLiveDraft(recording: boolean, rec: { readonly current: Recording | null }, ui: CaptureSetters): void {
  useEffect(() => {
    if (!recording) {
      return;
    }
    const busy = { current: false };
    const meter = window.setInterval(() => ui.setLevel(rec.current?.level() ?? 0), 100);
    const tick = window.setInterval(() => draftTick(rec, busy, ui.setDraft), DRAFT_EVERY_MS);
    return () => {
      window.clearInterval(meter);
      window.clearInterval(tick);
    };
  }, [recording]);
}

/**
 * Хук записи голоса.
 *
 * @param onFinal - итоговый текст (не пустой)
 */
export function useVoiceCapture(onFinal: (text: string) => void): VoiceCapture {
  const [recording, setRecording] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [draft, setDraft] = useState('');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const ui: CaptureSetters = { setRecording, setFinishing, setDraft, setLevel, setError };
  const rec = useRef<Recording | null>(null);
  const starting = useRef(false);
  const stopWanted = useRef(false);
  const final = useRef(onFinal);
  final.current = onFinal;

  const finish = useCallback(async (r: Recording, keep: boolean) => {
    rec.current = null;
    const text = await finishRecording(r, keep, ui);
    if (text !== null) {
      final.current(text);
    }
  }, []);

  const start = useCallback(() => {
    if (rec.current !== null || starting.current) {
      return;
    }
    setError(null);
    starting.current = true;
    stopWanted.current = false;
    openRecording()
      .then((r) => {
        starting.current = false;
        if (r === null) {
          return; // модели нет: открыто окно скачивания
        }
        rec.current = r;
        setRecording(true);
        if (stopWanted.current) {
          void finish(r, true);
        }
      })
      .catch((err: unknown) => {
        starting.current = false;
        setError(micErrorText(err));
      });
  }, [finish]);

  const stop = useCallback(() => {
    if (rec.current === null) {
      stopWanted.current = starting.current;
      return;
    }
    void finish(rec.current, true);
  }, [finish]);

  const cancel = useCallback(() => {
    if (rec.current !== null) {
      void finish(rec.current, false);
    }
  }, [finish]);

  useLiveDraft(recording, rec, ui);

  useEffect(() => () => {
    rec.current?.stop();
  }, []);

  return { recording, finishing, draft, level, error, start, stop, cancel };
}
