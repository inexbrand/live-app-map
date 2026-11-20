/**
 * Тестовый HTTP-сервер вокруг connect-middleware (настоящий node:http).
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DevMiddleware } from './dev-http';

/** Запущенный сервер и его адрес. */
export type TestServer = {
  readonly url: string;
  close(): Promise<void>;
};

/**
 * Поднимает сервер на случайном порту; запросы мимо middleware → 404.
 *
 * @param middleware - проверяемый middleware
 */
export async function serveMiddleware(middleware: DevMiddleware): Promise<TestServer> {
  const server: Server = createServer((req, res) => {
    middleware(req, res, () => {
      res.statusCode = 404;
      res.end('next');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address: AddressInfo | string | null = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('сервер не получил TCP-порт');
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
