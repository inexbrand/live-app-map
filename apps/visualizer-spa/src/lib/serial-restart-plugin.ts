/**
 * Перезапуски dev-сервера по правке vite.config — строго по очереди.
 *
 * vite 6 сам не даёт перезапускам наложиться (server._restartPromise), но внутри restartServer
 * делает Object.assign(server, newServer) и тем копирует newServer._restartPromise = null поверх
 * идущего перезапуска. Правка конфига в это окно (несколько записей за секунду) запускает второй
 * перезапуск параллельно первому: он закрывает сервер и слушает порт, который первый ещё не
 * отпустил или уже занял, — со strictPort это «Port N is already in use». Здесь restart
 * оборачивается очередью: следующий ждёт конца текущего, правки во время ожидания сливаются
 * в один перезапуск. Очередь живёт в globalThis: при перезапуске vite заново вычисляет конфиг,
 * и модуль плагина создаётся заново.
 */
import type { Plugin, ViteDevServer } from 'vite';

const QUEUE_KEY = '__lamRestartQueue';

/** Очередь перезапусков процесса: идущий и один ожидающий (в него сливаются новые правки). */
type RestartQueue = { running: Promise<void> | null; waiting: Promise<void> | null };

function queue(): RestartQueue {
  const existing: unknown = Reflect.get(globalThis, QUEUE_KEY);
  if (typeof existing === 'object' && existing !== null && 'running' in existing && 'waiting' in existing) {
    return existing as RestartQueue;
  }
  const created: RestartQueue = { running: null, waiting: null };
  Reflect.set(globalThis, QUEUE_KEY, created);
  return created;
}

/**
 * Ставит перезапуск в очередь процесса.
 *
 * @param run - сам перезапуск (исходный server.restart)
 * @returns обещание, которое выполнится после перезапуска, учитывающего эту правку
 */
export function enqueueRestart(run: () => Promise<void>): Promise<void> {
  const q = queue();
  if (q.waiting !== null) {
    return q.waiting;
  }
  const start = (): Promise<void> => {
    const current = run().finally(() => {
      if (q.running === current) {
        q.running = null;
      }
    });
    q.running = current;
    return current;
  };
  if (q.running === null) {
    return start();
  }
  const waiting = q.running
    .catch(() => undefined)
    .then(() => {
      q.waiting = null;
      return start();
    });
  q.waiting = waiting;
  return waiting;
}

/** Плагин: server.restart через очередь процесса. */
export function serialRestartPlugin(): Plugin {
  return {
    name: 'lam-serial-restart',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      const own = server.restart.bind(server);
      server.restart = (forceOptimize?: boolean) => enqueueRestart(() => own(forceOptimize));
    },
  };
}
