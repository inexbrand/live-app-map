/** Журнал аудита. */
export function AuditPage() {
  void fetch('/api/admin/audit');
  return <div />;
}
