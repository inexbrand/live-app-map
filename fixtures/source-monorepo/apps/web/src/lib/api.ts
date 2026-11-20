const BASE = '/api';

/** Методы HTTP для обёртки. */
export enum HttpMethod {
  Get = 'GET',
  Post = 'POST',
  Delete = 'DELETE',
}

/** Опции запроса обёртки. */
export type RequestOptions = { readonly method?: HttpMethod; readonly body?: unknown };

/** Обёртка над fetch: путь целиком от вызывающего, метод из опций. */
export async function apiFetch(path: string, options: RequestOptions = {}): Promise<unknown> {
  const method = options.method ?? HttpMethod.Get;
  const init = { method, body: JSON.stringify(options.body) };
  const res = await fetch(path, init);
  return res.json();
}

async function request(method: string, path: string): Promise<Response> {
  return fetch(`${BASE}${path}`, { method });
}

/** Объект-обёртка с базой /api. */
export const api = {
  get: (path: string) => request('GET', path),
  delete: (path: string) => request('DELETE', path),
};

/** Запрос, собранный билдером. */
export type ApiRequest = { readonly path: string; readonly method: string };

/** Клиент, принимающий готовый запрос. */
export class ApiClient {
  request(req: ApiRequest): Promise<Response> {
    return fetch(req.path, { method: req.method });
  }
}

export const client = new ApiClient();

/** Билдер: посты пользователя. */
export const requests = {
  postsOf: (userId: string): ApiRequest => ({ path: `/users/${userId}/posts`, method: 'GET' }),
};
