import { HttpMethod, api, apiFetch } from './api';
import { http } from './http';

/** Список пользователей. */
export function useUsers(): Promise<unknown> {
  return apiFetch('/api/users');
}

/** Карточка пользователя. */
export function loadUser(id: string): Promise<unknown> {
  return apiFetch(`/api/users/${encodeURIComponent(id)}`, { method: HttpMethod.Get });
}

/** Удаление из админки. */
export function removeUser(id: string): Promise<Response> {
  return api.delete(`/admin/users/${id}`);
}

/** Создание пользователя. */
export function createUser(email: string): Promise<unknown> {
  return http.post('/users', { email });
}
