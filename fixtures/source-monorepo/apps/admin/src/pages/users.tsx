import { ActivityFeed } from '@/widgets/activity';

/** Пользователи: список и карточка; виджет подключён через алиас пути из tsconfig. */
export function UsersPage() {
  void fetch('/api/admin/users');
  return <ActivityFeed />;
}
