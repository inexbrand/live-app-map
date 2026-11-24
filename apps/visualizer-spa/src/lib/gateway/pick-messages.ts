/**
 * Сообщения пикера между страницей шлюза и визуализатором: типы и проверка.
 */


import type { StackFrame, StackSource } from '@live-app-map/sdk/runtime';

/** Место в исходнике из стека React (dev) и кадр стека — общие с рантаймом SDK. */
export type { StackFrame, StackSource };

/** Исходная позиция по sourcemap. */
export type OriginalPosition = { readonly source: string; readonly line: number; readonly column: number };

/** Компонент React над элементом. */
export type PickedComponent = {
  readonly name: string;
  readonly chain: readonly string[];
  readonly stack: StackSource | null;
};

/** Компонент из fiber до перевода позиции: кадр стека ещё в отданном коде. */
export type RawComponent = {
  readonly name: string;
  readonly chain: readonly string[];
  /** React 18: уже исходная позиция. */
  readonly source: StackSource | null;
  /** React 19: кадр стека для sourcemap. */
  readonly frame: StackFrame | null;
};

/** Рамка, CSS px. */
export type PickRect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** Ответ страницы: выбранный элемент. */
export type LamPickedMessage = {
  readonly lam: 'picked';
  readonly selector: string;
  readonly domPath: string;
  readonly tag: string;
  readonly text: string;
  /** В координатах документа. */
  readonly rect: PickRect;
  /** В координатах окна страницы (для снимка). */
  readonly client: PickRect;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly component: PickedComponent | null;
};

/** Пользователь отменил выбор (Esc в странице). */
export type LamPickCancelMessage = { readonly lam: 'pick-cancel' };

/** Минимум элемента, нужный для селектора (настоящий Element подходит). */
export type PickElement = {
  readonly tagName: string;
  readonly id: string;
  readonly classList: ArrayLike<string>;
  readonly parentElement: PickElement | null;
  readonly previousElementSibling: PickElement | null;
  readonly nextElementSibling: PickElement | null;
  getAttribute(name: string): string | null;
};

/**
 * Проверяет сообщение «элемент выбран».
 *
 * @param data - data из MessageEvent
 */
export function isLamPickedMessage(data: unknown): data is LamPickedMessage {
  return typeof data === 'object' && data !== null && 'lam' in data && data.lam === 'picked' && 'selector' in data && typeof data.selector === 'string';
}

/**
 * Проверяет сообщение «выбор отменён».
 *
 * @param data - data из MessageEvent
 */
export function isLamPickCancelMessage(data: unknown): data is LamPickCancelMessage {
  return typeof data === 'object' && data !== null && 'lam' in data && data.lam === 'pick-cancel';
}
