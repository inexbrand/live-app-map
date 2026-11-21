import { useContext } from 'react';
import { ProfileApiContext } from '../app/Shell';
import { createSharedClient } from '../stores/shared-client';

/** Страница настроек: файл экрана — сам компонент (как у TanStack Router). */
export function SettingsPage() {
  const profile = useContext(ProfileApiContext);
  void fetch('/v1/settings');
  void createSharedClient().me();
  void profile.fetchProfile();
  return <div />;
}
