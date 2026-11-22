/**
 * Пользователи dev-входа korbor для настроек: список, ошибка, загрузка при открытии листа.
 */
import { useEffect, useState } from 'react';
import { fetchDogfoodActors, isDogfoodClientEnabled, type DogfoodActor } from '../../lib/dogfood-api';

/** Список пользователей dev-входа и как его обновить. */
export type DogfoodActorsState = {
  readonly actors: readonly DogfoodActor[];
  readonly error: string | null;
  readonly setActors: (actors: readonly DogfoodActor[]) => void;
  readonly setError: (error: string | null) => void;
};

/**
 * Пользователи dev-входа; запрашиваются каждый раз, когда открываются настройки.
 *
 * @param settingsOpen - открыт ли лист настроек
 */
export function useDogfoodActors(settingsOpen: boolean): DogfoodActorsState {
  const [actors, setActors] = useState<readonly DogfoodActor[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!settingsOpen) {
      return;
    }
    if (!isDogfoodClientEnabled(import.meta.env)) {
      setActors([]);
      setError('Авто-вход отключён в production-сборке');
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await fetchDogfoodActors();
      if (cancelled) {
        return;
      }
      if (!res.ok) {
        setActors([]);
        setError(res.error);
        return;
      }
      setActors(res.data);
      setError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [settingsOpen]);
  return { actors, error, setActors, setError };
}
