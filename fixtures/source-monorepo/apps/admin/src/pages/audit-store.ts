/** fetch с токеном: передаёт оболочка (сессия админки). */
export type AuthedFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Строка запроса из фильтра. */
function query(f: { readonly actor?: string }): string {
  return f.actor === undefined ? '' : `?actor=${encodeURIComponent(f.actor)}`;
}

/** Стор журнала: fetch приходит параметром, путь — шаблон с хвостом query. */
export function createAuditStore(fetchWithAuth: AuthedFetch) {
  return {
    async load(f: { readonly actor?: string }) {
      return fetchWithAuth(`/api/admin/audit/events${query(f)}`);
    },
    async ack(id: string) {
      return fetchWithAuth(`/api/admin/audit/events/${encodeURIComponent(id)}/ack`, { method: 'POST' });
    },
  };
}
