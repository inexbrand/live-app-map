/**
 * Голосовой ввод: выбранная модель и язык, есть ли модель на этой машине,
 * загрузка с прогрессом, окно согласия на скачивание.
 */
import { create } from 'zustand';
import { anyBody, requestJson } from '../lib/dev-api';
import { detectVoiceDevice, disposeVoiceEngine, loadVoiceModel } from '../lib/voice/voice-engine';
import {
  VOICE_LANGUAGES,
  VOICE_MODELS,
  voiceModel,
  voiceModelFiles,
  type VoiceDevice,
  type VoiceLanguage,
  type VoiceModelId,
} from '../lib/voice/models';

const SETTINGS_KEY = 'lam-voice';
/** Ключ Cache Storage transformers.js. */
const BROWSER_CACHE = 'transformers-cache';

/** Фаза модели. */
export type VoicePhase = 'idle' | 'downloading' | 'ready' | 'error';

type VoiceState = {
  readonly model: VoiceModelId;
  readonly language: VoiceLanguage;
  readonly device: VoiceDevice | null;
  /** Модель целиком есть в браузере или на диске; null — ещё не проверяли. */
  readonly present: boolean | null;
  /** Размер файлов выбранной модели для устройства, байты. */
  readonly sizeBytes: number | null;
  readonly phase: VoicePhase;
  readonly progress: { readonly loaded: number; readonly total: number } | null;
  readonly error: string | null;
  readonly dialog: boolean;
  readonly setDialog: (open: boolean) => void;
  readonly setModel: (model: VoiceModelId) => void;
  readonly setLanguage: (language: VoiceLanguage) => void;
  /** Узнать устройство, размер и наличие модели. */
  readonly inspect: () => Promise<void>;
  /** Скачать (если нужно) и загрузить модель. */
  readonly load: () => Promise<boolean>;
  /** Удалить модель из браузера и с диска. */
  readonly remove: () => Promise<void>;
};

/** Поле сохранённых настроек, если оно из списка допустимых. */
function knownField<T extends string>(raw: unknown, key: string, known: readonly { readonly id: T }[]): T | undefined {
  const value: unknown = typeof raw === 'object' && raw !== null ? Reflect.get(raw, key) : undefined;
  return known.find((x) => x.id === value)?.id;
}

/**
 * Настройки голоса из localStorage: неизвестная модель или язык (или битый JSON) —
 * модель base и русский.
 *
 * @param text - сохранённый JSON или null
 */
export function parseVoiceSettings(text: string | null): { model: VoiceModelId; language: VoiceLanguage } {
  let raw: unknown = null;
  try {
    raw = JSON.parse(text ?? '{}');
  } catch {
    raw = null;
  }
  return { model: knownField(raw, 'model', VOICE_MODELS) ?? 'base', language: knownField(raw, 'language', VOICE_LANGUAGES) ?? 'ru' };
}

function readSettings(): { model: VoiceModelId; language: VoiceLanguage } {
  try {
    return parseVoiceSettings(localStorage.getItem(SETTINGS_KEY));
  } catch {
    // Хранилище недоступно (песочница браузера) — как без сохранённых настроек.
    return parseVoiceSettings(null);
  }
}

function saveSettings(model: VoiceModelId, language: VoiceLanguage): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ model, language }));
}

function fileUrl(repo: string, file: string): string {
  return `${location.origin}/__lam_models/hf/${repo}/resolve/main/${file}`;
}

async function inBrowserCache(repo: string, files: readonly string[]): Promise<boolean> {
  if (typeof caches === 'undefined') {
    return false;
  }
  const cache = await caches.open(BROWSER_CACHE);
  for (const f of files) {
    if ((await cache.match(fileUrl(repo, f))) === undefined) {
      return false;
    }
  }
  return true;
}

/** Store голосового ввода. */
export const useVoiceStore = create<VoiceState>((set, get) => ({
  ...readSettings(),
  device: null,
  present: null,
  sizeBytes: null,
  phase: 'idle',
  progress: null,
  error: null,
  dialog: false,
  setDialog: (dialog) => {
    set({ dialog });
    if (dialog) {
      void get().inspect();
    }
  },
  setModel: (model) => {
    if (model === get().model) {
      return;
    }
    disposeVoiceEngine();
    saveSettings(model, get().language);
    set({ model, phase: 'idle', progress: null, present: null, sizeBytes: null, error: null });
    void get().inspect();
  },
  setLanguage: (language) => {
    saveSettings(get().model, language);
    set({ language });
  },
  inspect: async () => {
    const device = get().device ?? (await detectVoiceDevice());
    const { model } = get();
    const repo = voiceModel(model).repo;
    const files = voiceModelFiles(model, device);
    set({ device });
    try {
      const r = await requestJson(`/__lam_models/size?repo=${encodeURIComponent(repo)}&files=${encodeURIComponent(files.join(','))}`);
      if (!r.ok && r.status === null) {
        throw new Error(r.error);
      }
      const body = anyBody(r);
      const bytes = typeof body === 'object' && body !== null && 'bytes' in body && typeof body.bytes === 'number' ? body.bytes : null;
      const onDisk = typeof body === 'object' && body !== null && 'bytesOnDisk' in body && typeof body.bytesOnDisk === 'number' ? body.bytesOnDisk : 0;
      const present = (bytes !== null && bytes > 0 && onDisk === bytes) || (await inBrowserCache(repo, files));
      if (get().model === model) {
        set({ sizeBytes: bytes, present });
      }
    } catch (err) {
      const present = await inBrowserCache(repo, files);
      set({ present, error: present ? null : `Размер модели неизвестен: ${err instanceof Error ? err.message : String(err)}` });
    }
  },
  load: async () => {
    const device = get().device ?? (await detectVoiceDevice());
    set({ device, phase: 'downloading', error: null, progress: null });
    try {
      await loadVoiceModel(get().model, device, (progress) => set({ progress }));
      set({ phase: 'ready', present: true, progress: null });
      return true;
    } catch (err) {
      set({ phase: 'error', error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },
  remove: async () => {
    disposeVoiceEngine();
    const repo = voiceModel(get().model).repo;
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(BROWSER_CACHE);
      for (const req of await cache.keys()) {
        if (req.url.includes(`/hf/${repo}/`)) {
          await cache.delete(req);
        }
      }
    }
    const removed = await requestJson(`/__lam_models/hf/${repo}`, { method: 'DELETE' });
    if (!removed.ok && removed.status === null) {
      throw new Error(removed.error);
    }
    set({ phase: 'idle', present: false, progress: null });
    await get().inspect();
  },
}));
