import { UserRow } from '../../components/UserRow';
import { useUsers } from '../../lib/users';

/** Экран списка пользователей. */
export default function UsersPage() {
  void useUsers();
  void fetch('/api/unknown-thing');
  return <UserRow id="1" />;
}
