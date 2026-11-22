/** Текст ошибки для пользователя; отказ в доступе (NotAllowedError) — словами `denied`. */
export function errorText(err: unknown, denied: string): string {
  if (err instanceof DOMException && err.name === 'NotAllowedError') {
    return denied;
  }
  return err instanceof Error ? err.message : String(err);
}
