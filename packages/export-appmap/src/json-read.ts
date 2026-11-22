/**
 * Чтение неизвестного JSON: объект ли это, строка ли поле.
 */


/**
 * Проверка plain-object (не null, не массив).
 * @param value — произвольное значение
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Извлечь строку из unknown без String() на объектах.
 * @param value — поле JSON
 */
export function readString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return undefined;
}
