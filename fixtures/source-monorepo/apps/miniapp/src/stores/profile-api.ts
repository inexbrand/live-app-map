/** Клиент профиля: создаёт оболочка, экраны получают его из контекста. */
export interface ProfileApi {
  fetchProfile(): Promise<unknown>;
  saveProfile(): Promise<unknown>;
}

export function createProfileApi(): ProfileApi {
  return {
    fetchProfile: () => fetch('/v1/profile'),
    saveProfile: () => fetch('/v1/profile', { method: 'PUT' }),
  };
}
