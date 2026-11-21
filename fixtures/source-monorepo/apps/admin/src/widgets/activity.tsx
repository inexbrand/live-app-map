/** Лента действий пользователя: виджет карточки. */
export function ActivityFeed() {
  void fetch('/api/admin/activity');
  return <div />;
}
