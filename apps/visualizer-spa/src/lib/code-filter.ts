/**
 * Фильтр списков панели кода по строке.
 */

/**
 * Совпадает ли элемент с запросом: каждое слово запроса есть хотя бы в одном поле.
 * Пустой запрос совпадает со всем.
 *
 * @param query - строка фильтра
 * @param fields - поля элемента (путь, имя, описание)
 * @returns true, если элемент показывать
 */
export function matchesCodeFilter(query: string, fields: readonly (string | undefined)[]): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter((w) => w !== '');
  if (words.length === 0) {
    return true;
  }
  const hay = fields.filter((f): f is string => f !== undefined).join('\n').toLowerCase();
  return words.every((w) => hay.includes(w));
}
