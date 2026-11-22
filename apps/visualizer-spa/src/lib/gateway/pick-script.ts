import { cssEscape, cssSelectorFor, domPathOf, installPicker, nthOfType, qualifierOf, reactComponentOf, selectorPart } from './pick-dom';
import { componentNameOf, frameFromStack, mapFrame, originalPosition } from './pick-source';
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
  return [componentNameOf, frameFromStack, originalPosition, mapFrame, cssEscape, qualifierOf, nthOfType, selectorPart, cssSelectorFor, domPathOf, reactComponentOf, installPicker]
    .map((f) => f.toString())
    .join('\n') + '\ntry{installPicker();}catch(e){}';
}