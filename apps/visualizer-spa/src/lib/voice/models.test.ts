/**
 * Каталог моделей и помощники голосового ввода.
 */
import { describe, expect, test } from 'bun:test';
import { appendSpoken, formatBytes, resampleLinear, voiceModelFiles, whisperLanguage } from './models';

describe('голос: модели и текст', () => {
  test('файлы модели зависят от устройства: WASM — q8, WebGPU — fp32 + q4', () => {
    expect(voiceModelFiles('base', 'wasm').slice(-2)).toEqual(['onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx']);
    expect(voiceModelFiles('base', 'webgpu').slice(-2)).toEqual(['onnx/encoder_model.onnx', 'onnx/decoder_model_merged_q4.onnx']);
    expect(voiceModelFiles('turbo', 'wasm').slice(-2)).toEqual(['onnx/encoder_model_q4.onnx', 'onnx/decoder_model_merged_q4.onnx']);
    expect(voiceModelFiles('small', 'wasm')).toContain('tokenizer.json');
  });

  test('язык Whisper', () => {
    expect([whisperLanguage('ru'), whisperLanguage('uz'), whisperLanguage('en')]).toEqual(['russian', 'uzbek', 'english']);
  });

  test('передискретизация 48 кГц → 16 кГц сохраняет длительность и форму', () => {
    const src = new Float32Array(48_000).map((_, i) => Math.sin((2 * Math.PI * 440 * i) / 48_000));
    const out = resampleLinear(src, 48_000, 16_000);
    expect(out.length).toBe(16_000);
    expect(out[4]).toBeCloseTo(src[12] ?? 0, 5);
  });

  test('распознанное дописывается в поле через пробел, с заглавной после точки', () => {
    expect(appendSpoken('', ' кнопка обрезана ')).toBe('Кнопка обрезана');
    expect(appendSpoken('Шапка', 'налезает на текст')).toBe('Шапка налезает на текст');
    expect(appendSpoken('Шапка налезает.', 'ещё отступ')).toBe('Шапка налезает. Ещё отступ');
    expect(appendSpoken('Шапка', '   ')).toBe('Шапка');
  });

  test('размер для подписи', () => {
    expect(formatBytes(80_123_000)).toBe('80 МБ');
    expect(formatBytes(1_250_000_000)).toBe('1,3 ГБ');
  });
});
