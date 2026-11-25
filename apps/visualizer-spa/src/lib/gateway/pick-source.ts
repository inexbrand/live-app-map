/**
 * Пикер, сторона исходника: имя компонента React, кадр стека, позиция по source map.
 *
 * Функции встраиваются в скрипт страницы как текст (toString, pick-script.ts): без
 * замыканий, друг друга зовут по имени; импорты здесь — только для проверки типов.
 */
import { lamBundleSource, lamIsBundleFile, originalPosition } from '@live-app-map/sdk/runtime';
import type { StackFrame, StackSource } from './pick-messages';

// Имя компонента, кадр стека и sourcemap — общие с рантаймом SDK (window.__LAM__.components)
export { advanceMapping, appFrameOf, componentNameOf, decodeVlq, frameFromStack, functionComponentName, lamBundleFrameInLibrary, lamBundleSource, lamIndexedPosition, lamIndexMap, lamIsBundleFile, lamMapFor, originalPosition, scanMappingRow } from '@live-app-map/sdk/runtime';

/**
 * Переводит кадр в исходную строку: страница сама читает свой модуль у
 * dev-сервера и его встроенную sourcemap.
 *
 * @param frame - кадр стека
 */
export async function mapFrame(frame: StackFrame): Promise<StackSource> {
  try {
    const code = await (await fetch(frame.url)).text();
    const m = /\/\/# sourceMappingURL=(\S+)\s*$/.exec(code);
    if (m === null) {
      return { file: frame.file, line: null };
    }
    const ref = m[1] ?? '';
    let json = '';
    const inline = /^data:application\/json;(?:charset=[^;,]+;)?base64,(.*)$/.exec(ref);
    if (inline !== null) {
      const bin = atob(inline[1] ?? '');
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      json = new TextDecoder().decode(bytes);
    } else {
      json = await (await fetch(new URL(ref, frame.url).href)).text();
    }
    const mapUrl = inline !== null ? frame.url : new URL(ref, frame.url).href;
    const pos = originalPosition(JSON.parse(json), frame.line, frame.column);
    // Кадр из бандла сборки для карты: файл — исходник из карты, а не сам бандл
    const file = pos !== null && pos.source !== '' && lamIsBundleFile(frame.file) ? lamBundleSource(pos.source, mapUrl) : frame.file;
    return { file, line: pos === null ? null : pos.line };
  } catch (e) {
    return { file: frame.file, line: null };
  }
}