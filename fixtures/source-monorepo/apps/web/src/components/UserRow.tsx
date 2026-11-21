import { removeUser } from '../lib/users';

/** Строка пользователя с удалением. */
export function UserRow(props: { readonly id: string }) {
  return <button onClick={() => removeUser(props.id)}>{props.id}</button>;
}
