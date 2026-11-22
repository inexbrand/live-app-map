/** `{ key: value }`, если значение есть, иначе `{}`. */
export function optionalField<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  const out: Partial<Record<K, V>> = {};
  if (value !== undefined) {
    out[key] = value;
  }
  return out;
}
