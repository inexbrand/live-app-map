import { AuditPage } from './pages/audit';
import { UsersPage } from './pages/users';

/** Раздел пути → экран: компонент выбирается по первому сегменту. */
export function renderRoute(pathname: string) {
  const [section] = pathname.split('/').filter(Boolean);
  switch (section) {
    case 'users':
      return <UsersPage />;
    case 'audit':
    case 'journal':
      return <AuditPage />;
    default:
      return null;
  }
}
