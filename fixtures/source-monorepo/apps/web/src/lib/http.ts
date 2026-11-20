import axios from 'axios';
import ky from 'ky';

/** axios с базой из env (origin без пути). */
export const http = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL });

/** ky с префиксом. */
export const shop = ky.create({ prefixUrl: '/' });
