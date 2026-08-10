/**
 * Fixture: admin-like route-config с helper def(id, section, relativePath).
 */

/**
 * Регистрирует секцию админки (паттерн Korbor admin).
 */
export function def(id: string, section: string, relPath: string, index = false) {
  return { id, section, relPath, index };
}

export const ADMIN_ROUTES = [
  def('dashboard', '/dashboard', 'dashboard', true),
  def('users', '/users', 'users'),
  def('user-detail', '/users', 'users/:id'),
  def('deals', '/deals', 'deals'),
  def('deal-detail', '/deals', 'deals/:dealId'),
  def('settings', '/settings', 'settings/*rest'),
];
