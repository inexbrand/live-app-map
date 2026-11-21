/**
 * Модели распознавания речи (Whisper, ONNX для transformers.js) и чистые
 * помощники голосового ввода. Звук обрабатывается только в браузере.
 */

/** Модель на выбор. */
export type VoiceModelId = 'base' | 'small' | 'turbo';
/** Где считается модель. */
export type VoiceDevice = 'webgpu' | 'wasm';
/** Язык речи. */
export type VoiceLanguage = 'ru' | 'uz' | 'en';
/** Точность весов в ONNX. */
export type VoiceDtype = 'fp32' | 'q8' | 'q4';

/** Описание модели. */
export type VoiceModel = {
  readonly id: VoiceModelId;
  /** Репозиторий Hugging Face. */
  readonly repo: string;
  readonly title: string;
  readonly note: string;
};

/** Модели по возрастанию размера. */
export const VOICE_MODELS: readonly VoiceModel[] = [
  { id: 'base', repo: 'onnx-community/whisper-base', title: 'Быстрая', note: 'Whisper base. Русский и английский — хорошо, узбекский — слабо.' },
  { id: 'small', repo: 'onnx-community/whisper-small', title: 'Точная', note: 'Whisper small. Заметно точнее на русском, узбекский — сносно.' },
  { id: 'turbo', repo: 'onnx-community/whisper-large-v3-turbo', title: 'Максимальная', note: 'Whisper large v3 turbo. Лучше всех на узбекском, долго качается и требует WebGPU.' },
];

/** Языки: код → имя для Whisper и подпись. */
export const VOICE_LANGUAGES: ReadonlyArray<{ readonly id: VoiceLanguage; readonly whisper: string; readonly label: string }> = [
  { id: 'ru', whisper: 'russian', label: 'Русский' },
  { id: 'uz', whisper: 'uzbek', label: 'Oʻzbekcha' },
  { id: 'en', whisper: 'english', label: 'English' },
];

/** Файлы модели, кроме весов (токенизатор и настройки). */
export const VOICE_CONFIG_FILES: readonly string[] = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
];

/** Частота, которую ждёт Whisper. */
export const WHISPER_SAMPLE_RATE = 16_000;

/**
 * Модель по id.
 *
 * @param id - id модели
 */
export function voiceModel(id: VoiceModelId): VoiceModel {
  const m = VOICE_MODELS.find((x) => x.id === id);
  if (m === undefined) {
    throw new Error(`нет модели ${id}`);
  }
  return m;
}

/**
 * Точность весов: на WebGPU кодировщик fp32 и декодер q4 (q8 там медленный),
 * на WASM оба q8; turbo в fp32 весит 2,5 ГБ — только q4.
 *
 * @param id - модель
 * @param device - устройство
 */
export function voiceDtype(id: VoiceModelId, device: VoiceDevice): { readonly encoder_model: VoiceDtype; readonly decoder_model_merged: VoiceDtype } {
  if (id === 'turbo') {
    return { encoder_model: 'q4', decoder_model_merged: 'q4' };
  }
  return device === 'webgpu'
    ? { encoder_model: 'fp32', decoder_model_merged: 'q4' }
    : { encoder_model: 'q8', decoder_model_merged: 'q8' };
}

const SUFFIX: Readonly<Record<VoiceDtype, string>> = { fp32: '', q8: '_quantized', q4: '_q4' };

/**
 * Все файлы, которые скачает transformers.js для модели на устройстве.
 *
 * @param id - модель
 * @param device - устройство
 */
export function voiceModelFiles(id: VoiceModelId, device: VoiceDevice): readonly string[] {
  const d = voiceDtype(id, device);
  return [
    ...VOICE_CONFIG_FILES,
    `onnx/encoder_model${SUFFIX[d.encoder_model]}.onnx`,
    `onnx/decoder_model_merged${SUFFIX[d.decoder_model_merged]}.onnx`,
  ];
}

/**
 * Имя языка для Whisper.
 *
 * @param lang - код
 */
export function whisperLanguage(lang: VoiceLanguage): string {
  return VOICE_LANGUAGES.find((l) => l.id === lang)?.whisper ?? 'russian';
}

/**
 * Линейная передискретизация моно-сигнала.
 *
 * @param input - сэмплы
 * @param from - исходная частота, Гц
 * @param to - нужная частота, Гц
 */
export function resampleLinear(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to || input.length === 0) {
    return input;
  }
  const out = new Float32Array(Math.max(1, Math.round((input.length * to) / from)));
  const step = from / to;
  for (let i = 0; i < out.length; i++) {
    const pos = i * step;
    const i0 = Math.floor(pos);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const t = pos - i0;
    out[i] = (input[i0] ?? 0) * (1 - t) + (input[i1] ?? 0) * t;
  }
  return out;
}

/**
 * Вставляет распознанный текст в поле: через пробел, с заглавной в начале
 * предложения; пустое распознавание поле не меняет.
 *
 * @param current - текст поля
 * @param spoken - распознанное
 */
export function appendSpoken(current: string, spoken: string): string {
  const s = spoken.replace(/\s+/g, ' ').trim();
  if (s === '') {
    return current;
  }
  const base = current.replace(/\s+$/, '');
  if (base === '') {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  const startsSentence = /[.!?]$/.test(base);
  return `${base} ${startsSentence ? s.charAt(0).toUpperCase() + s.slice(1) : s}`;
}

/**
 * Мегабайты для подписи: «77 МБ», «1,2 ГБ».
 *
 * @param bytes - размер
 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) {
    return `${(bytes / 1e9).toFixed(1).replace('.', ',')} ГБ`;
  }
  return `${Math.max(1, Math.round(bytes / 1e6))} МБ`;
}
