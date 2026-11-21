import { createContext } from 'react';
import { createProfileApi } from '../stores/profile-api';

/** Контекст клиента профиля; значение кладёт оболочка. */
export const ProfileApiContext = createContext(null);

/** Оболочка внедряет клиент профиля через контекст. */
export function Shell(props: { readonly children: unknown }) {
  return <ProfileApiContext.Provider value={createProfileApi()}>{props.children}</ProfileApiContext.Provider>;
}
