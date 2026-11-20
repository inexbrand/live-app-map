/**
 * Карточка пользователя: имя и почта.
 */
export function UserCard(props: { name: string; email: string }) {
  return <div>{props.name} {props.email}</div>;
}

// Форматирует имя для заголовка.
export const formatName = (name: string): string => name.trim();

/** Состояние формы профиля. */
export class ProfileStore {
  name = '';
}

/** Пропсы карточки. */
export interface UserCardProps {
  readonly name: string;
}

function internalHelper(): void {}
