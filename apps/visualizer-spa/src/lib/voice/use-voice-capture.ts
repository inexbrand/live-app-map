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
  const rec = useRef<Recording | null>(null);
  const starting = useRef(false);
  const stopWanted = useRef(false);
  const final = useRef(onFinal);
  final.current = onFinal;

  const finish = useCallback(async (r: Recording, keep: boolean) => {
    const audio = r.stop();
    rec.current = null;
    setRecording(false);
    setLevel(0);
    if (!keep || audio.length < MIN_SAMPLES) {
      setDraft('');
      return;
    }
    setFinishing(true);
    try {
      if (!isVoiceModelLoaded() && !(await useVoiceStore.getState().load())) {
        throw new Error(useVoiceStore.getState().error ?? 'модель не загрузилась');
      }
      const text = await transcribe(audio, whisperLanguage(useVoiceStore.getState().language));
      if (text !== '') {
        final.current(text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDraft('');
      setFinishing(false);
    }
  }, []);

  const start = useCallback(() => {
    if (rec.current !== null || starting.current) {
      return;
    }
    setError(null);
    starting.current = true;
    stopWanted.current = false;
    void (async () => {
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
    })()
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
        setError(err instanceof DOMException && err.name === 'NotAllowedError' ? 'Нет доступа к микрофону' : err instanceof Error ? err.message : String(err));
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

  useEffect(() => {
    if (!recording) {
      return;
    }
    let busy = false;
    const meter = window.setInterval(() => setLevel(rec.current?.level() ?? 0), 100);
    const tick = window.setInterval(() => {
      const r = rec.current;
      if (r === null || busy || !isVoiceModelLoaded()) {
        return;
      }
      const audio = r.samples();
      if (audio.length < MIN_SAMPLES) {
        return;
      }
      busy = true;
      transcribe(audio, whisperLanguage(useVoiceStore.getState().language))
        .then((t) => {
          if (rec.current === r) {
            setDraft(t);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    }, DRAFT_EVERY_MS);
    return () => {
      window.clearInterval(meter);
      window.clearInterval(tick);
    };
  }, [recording]);

  useEffect(() => () => {
    rec.current?.stop();
  }, []);

  return { recording, finishing, draft, level, error, start, stop, cancel };
}
