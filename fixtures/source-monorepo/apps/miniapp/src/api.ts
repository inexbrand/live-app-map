import { treaty } from '@elysiajs/eden';
import { hc } from 'hono/client';

/** Eden treaty к API, база из env. */
export const eden = treaty(import.meta.env.VITE_API_URL);

/** Hono RPC к сервису заказов. */
export const rpc = hc('/');
