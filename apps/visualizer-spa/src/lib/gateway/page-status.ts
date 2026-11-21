/**
 * Состояние живого экрана по отчёту шлюза: вход и обрезка по высоте.
 */
import type { LamPageMessage } from './inject-script';

/** Сколько px запаса не считается обрезкой (полосы прокрутки, округление). */
const CROP_SLACK = 8;

/** Что показать на ноде. */
export type PageStatus = {
  /** Нет входа: API ответило 401/403. Текст подсказки. */
  readonly unauthorized: string | null;
  /** Видна не вся страница: «видно 1080 из 2400 px». */
  readonly cropped: string | null;
  /** Высота контента, px (для режима «во всю высоту»). */
  readonly contentHeight: number | null;
};

/**
 * Состояние экрана.
 *
 * @param report - последний отчёт страницы (нет — ещё не загрузилась)
 * @param frameHeight - высота окна iframe, px
 */
export function pageStatus(report: LamPageMessage | undefined, frameHeight: number): PageStatus {
  if (report === undefined) {
    return { unauthorized: null, cropped: null, contentHeight: null };
  }
  const unauthorized =
    report.authFailures > 0
      ? `Не авторизован (${report.profile === 'anon' ? 'нет профиля входа' : `профиль «${report.profile}»`}): ${report.lastAuthFailure ?? '401'}`
      : null;
  const cropped =
    report.contentHeight > frameHeight + CROP_SLACK ? `Видно ${frameHeight} из ${report.contentHeight} px` : null;
  return { unauthorized, cropped, contentHeight: report.contentHeight };
}
