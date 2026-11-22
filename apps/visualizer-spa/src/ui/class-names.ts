/**
 * Сборка className из базового класса и необязательных.
 */

/**
 * Непустые классы через пробел.
 *
 * @param parts - классы; пустые, false и undefined пропускаются
 */
export function cx(...parts: ReadonlyArray<string | false | null | undefined>): string {
  return parts.filter((p): p is string => typeof p === 'string' && p !== '').join(' ');
}
