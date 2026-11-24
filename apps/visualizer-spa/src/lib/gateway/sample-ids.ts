/**
 * Первые id списков API приложения под профилем: реальные значения
 * параметров маршрутов экранов (см. route-samples).
 */
import { firstId, isListPath } from '../route-samples';

/** Сколько списков читать за запрос. */
export const MAX_SAMPLE_LISTS = 50;

/**
 * Читает списки API и берёт id первой записи каждого.
 *
 * @param apiBase - адрес API, например http://127.0.0.1:16000, или origin фронтенда, проксирующего /api
 * @param headersFor - заголовки входа профиля для пути списка (Bearer или Cookie)
 * @param lists - пути списков (недопустимые пропускаются)
 * @returns путь списка → id (null — список пуст, закрыт профилю или упал)
 */
export async function fetchSampleIds(apiBase: string, headersFor: (list: string) => Record<string, string>, lists: readonly string[]): Promise<Record<string, string | null>> {
  const base = apiBase.replace(/\/$/, '');
  const wanted = [...new Set(lists.filter(isListPath))].slice(0, MAX_SAMPLE_LISTS);
  const entries = await Promise.all(
    wanted.map(async (list): Promise<[string, string | null]> => {
      try {
        // Самоподписанный HTTPS dev-сервера фронтенда (vite.localhost) принимается
        const res = await fetch(`${base}${list}`, { headers: { ...headersFor(list), accept: 'application/json' }, signal: AbortSignal.timeout(15_000), tls: { rejectUnauthorized: false } });
        return [list, res.ok ? firstId(await res.json()) : null];
      } catch {
        return [list, null];
      }
    }),
  );
  return Object.fromEntries(entries);
}
