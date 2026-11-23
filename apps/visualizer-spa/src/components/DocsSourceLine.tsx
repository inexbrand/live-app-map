/**
 * Откуда числа документации. Карта хранит снимок docs на момент скана; вид при открытии
 * читает диск и заменяет снимок. Пока чтение не закончилось или не удалось — видно,
 * что показан снимок (иначе граф и список показывают устаревшие числа без пояснения).
 */
import { useAppStore } from '../store/app-store';

/** Состояние чтения диска, пока ответа нет. */
export const READING_DOCS = 'читаю документацию с диска…';

/**
 * Строка-пояснение; документация с диска — ничего.
 *
 * @param props.live - true — прочитано с диска, иначе READING_DOCS или причина ошибки
 */
export function DocsSourceLine(props: { readonly live: true | string }) {
  const epochs = useAppStore((s) => s.document?.docs?.epochs.length ?? 0);
  if (props.live === true) {
    return null;
  }
  const why = props.live === READING_DOCS ? 'Читаю документацию с диска…' : `С диска не прочитать: ${props.live}`;
  return (
    <p className="docs-source" aria-live="polite" data-testid="docs-source">
      Показан снимок из карты (эпох: {epochs}). {why}
    </p>
  );
}