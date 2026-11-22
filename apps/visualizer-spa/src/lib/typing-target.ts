/**
 * Фокус в поле ввода: буквы принадлежат полю, горячие клавиши их не берут.
 *
 * @param t - цель события клавиатуры
 */
export function isTypingTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);
}
