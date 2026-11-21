/**
 * Сессия снимка экрана: согласие → доступ к вкладке → выделение → захват.
 * Отдельный store: снимок не связан с картой и не должен раздувать app-store.
 *
 * Поток вкладки открывается до выделения: Chrome при показе вкладки
 * добавляет панель «Вы показываете эту вкладку», страница сдвигается, и
 * выделенная заранее область съехала бы.
 */
import { create } from 'zustand';
import type { Rect } from '../lib/snapshot/region';

/**
 * Для чего снимаем. Замечание: выбор компонента курсором в живом экране
 * (element) или выделение области мышью (region).
 */
export type SnapshotPurpose =
  | { readonly kind: 'comment'; readonly pick: 'element' | 'region'; readonly pageId: string | null }
  | { readonly kind: 'agent'; readonly requestId: string; readonly note: string | null };

/** Фаза сессии; у каждой фазы ровно свои поля. */
export type SnapshotSession =
  | { readonly phase: 'idle' }
  /** Просьба агента ждёт клика пользователя (браузер требует жест). */
  | { readonly phase: 'requested'; readonly purpose: SnapshotPurpose }
  /** Ждём доступ к вкладке (getDisplayMedia). */
  | { readonly phase: 'opening'; readonly purpose: SnapshotPurpose }
  | { readonly phase: 'selecting'; readonly purpose: SnapshotPurpose }
  | { readonly phase: 'capturing'; readonly purpose: SnapshotPurpose; readonly rect: Rect };

type SnapshotStore = {
  readonly session: SnapshotSession;
  /**
   * Начать сессию: замечание — сразу к доступу (клик уже был), агент — ждать
   * согласия. Если сессия уже идёт — false.
   */
  request: (purpose: SnapshotPurpose) => boolean;
  /** Пользователь согласился на просьбу агента. */
  accept: () => void;
  /** Доступ к вкладке получен — можно выделять. */
  opened: () => void;
  /** Выделение готово — захват. */
  beginCapture: (rect: Rect) => void;
  /** Отмена до захвата (Esc, «Отмена», отказ в доступе). */
  cancel: () => void;
  /** Захват закончился — сессия закрыта. */
  finish: () => void;
};

/** Store сессии снимка. */
export const useSnapshotStore = create<SnapshotStore>((set, get) => ({
  session: { phase: 'idle' },
  request: (purpose) => {
    if (get().session.phase !== 'idle') {
      return false;
    }
    set({ session: { phase: purpose.kind === 'agent' ? 'requested' : 'opening', purpose } });
    return true;
  },
  accept: () => {
    const s = get().session;
    if (s.phase === 'requested') {
      set({ session: { phase: 'opening', purpose: s.purpose } });
    }
  },
  opened: () => {
    const s = get().session;
    if (s.phase === 'opening') {
      set({ session: { phase: 'selecting', purpose: s.purpose } });
    }
  },
  beginCapture: (rect) => {
    const s = get().session;
    if (s.phase === 'selecting') {
      set({ session: { phase: 'capturing', purpose: s.purpose, rect } });
    }
  },
  cancel: () => {
    if (get().session.phase !== 'capturing') {
      set({ session: { phase: 'idle' } });
    }
  },
  finish: () => set({ session: { phase: 'idle' } }),
}));

/**
 * Идёт выбор компонента курсором (iframe живых экранов принимают мышь).
 *
 * @param s - сессия
 */
export function isElementPick(s: SnapshotSession): boolean {
  return s.phase === 'selecting' && s.purpose.kind === 'comment' && s.purpose.pick === 'element';
}
