import { createAuditStore } from './audit-store';

/** Клиент админки: реализация не видна (интерфейс). */
type AdminApi = {
  getRaw(path: string): Promise<Response>;
  getUser(id: string): Promise<Response>;
};

/** Журнал аудита. */
export function AuditPage(props: { readonly fetchWithAuth: (input: string, init?: RequestInit) => Promise<Response>; readonly api: AdminApi }) {
  void fetch('/api/admin/audit');
  const store = createAuditStore(props.fetchWithAuth);
  void store.load({});
  void store.ack('1');
  const api = props.api;
  void api.getRaw(`/api/admin/audit/export?actor=${encodeURIComponent('x')}`);
  void api.getUser('1');
  return <div />;
}
