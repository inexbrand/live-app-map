import { appPlaceOf, componentChainOf, cssEscape, cssSelectorFor, debugPlaceOf, domPathOf, fiberOf, installPicker, nthOfType, pickedMessage, pickerBox, pickerClick, pickerCommand, pickerFlash, pickerHide, pickerKey, pickerMessage, pickerMove, pickerShow, pickerSourceOf, pickerSwallow, pickerTitle, qualifierOf, reactComponentOf, selectorPart } from './pick-dom';
import { advanceMapping, appFrameOf, componentNameOf, decodeVlq, frameFromStack, functionComponentName, mapFrame, originalPosition, scanMappingRow } from './pick-source';
export { cssSelectorFor, domPathOf, installPicker, reactComponentOf } from './pick-dom';
export { isLamPickCancelMessage, isLamPickedMessage } from './pick-messages';
export type { LamPickCancelMessage, LamPickedMessage, OriginalPosition, PickedComponent, PickElement, PickRect, RawComponent, StackFrame, StackSource } from './pick-messages';
export { componentNameOf, frameFromStack, mapFrame, originalPosition } from './pick-source';
/**
 * Выбор компонента курсором внутри страницы шлюза (часть inject-script).
 * Визуализатор шлёт странице `{lam:'pick', on}`; страница подсвечивает
 * элемент под курсором и по клику отвечает `{lam:'picked', …}`: селектор,
 * путь DOM, текст, рамка, компонент React и место в исходнике (dev).
 * `{lam:'flash', selector}` — прокрутить к элементу и мигнуть рамкой.
 *
 * Функции встраиваются в скрипт страницы как текст (toString): без
 * импортов и замыканий, друг друга зовут по имени.
 */

/**
 * Текст пикера для скрипта страницы: объявления функций и вызов установки.
 */
export function pickerScriptText(): string {
  const decls = [functionComponentName, componentNameOf, appFrameOf, frameFromStack, decodeVlq, advanceMapping, scanMappingRow, originalPosition, mapFrame, cssEscape, qualifierOf, nthOfType, selectorPart, cssSelectorFor, domPathOf, fiberOf, debugPlaceOf, appPlaceOf, componentChainOf, reactComponentOf, pickerBox, pickerHide, pickerShow, pickerTitle, pickerMove, pickerSwallow, pickedMessage, pickerClick, pickerSourceOf, pickerFlash, pickerKey, pickerCommand, pickerMessage, installPicker]
    .map((f) => f.toString())
    .join('\n');
  return `${decls}\n${renamedImportAliases(decls)}\ntry{installPicker();}catch(e){}`;
}

/**
 * Псевдонимы для имён, переименованных сборщиком.
 *
 * Функции из @live-app-map/sdk/runtime приходят в сборку vite.config двумя
 * путями (pick-dom и pick-source) — сборщик даёт второму импорту имя с числом
 * (componentNameOf2), и в тексте функции остаётся вызов этого имени. На
 * странице объявлено только исходное имя: без псевдонима пикер падает с
 * ReferenceError, и замечание к компоненту не открывается.
 *
 * @param text - объявления функций
 * @returns строки `var имя2 = имя;` для каждого такого вызова
 */
export function renamedImportAliases(text: string): string {
  const declared = new Set([...text.matchAll(/(?:^|\n)function\s+([\w$]+)\s*\(/g)].map((m) => m[1] ?? ''));
  const aliases = new Map<string, string>();
  for (const m of text.matchAll(/\b([A-Za-z_$][\w$]*?)(\d+)\b/g)) {
    const [whole = '', base = ''] = m;
    if (declared.has(base) && !declared.has(whole)) {
      aliases.set(whole, base);
    }
  }
  return [...aliases].map(([alias, base]) => `var ${alias} = ${base};`).join('\n');
}