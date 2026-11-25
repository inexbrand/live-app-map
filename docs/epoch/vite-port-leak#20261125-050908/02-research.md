# 02 — Ресерч

- `apps/visualizer-spa/src/lib/gateway/vite-plugin.ts` (startGatewayOn, previousGateway, ключ globalThis `__lamGatewayServer`) и `src/lib/stream/stream-plugin.ts` (startStreamOn, stopPrevious, `__lamStreamServer`): оба закрывают сервер прошлого запуска vite до старта, перебор портов ограничен 10 (4320–4329, 4321–4330). Дойти до 4599 или 92065 они не могут.
- vite 6.4.3 `httpServerStart` (node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:25112): без strictPort на EADDRINUSE вызывает `httpServer.listen(++port)` на том же объекте; колбэк передан только первому listen.
- Bun 1.4.0, node:http (замеры скриптами в scratchpad):
  1. после EADDRINUSE повторный listen занимает порт и шлёт 'listening', но колбэк первого listen не вызывается → `server.listen()` vite не завершается (лог «ready» не печатается, restart зависает);
  2. listen() на уже слушающем сервере занимает ещё один порт и держит оба;
  3. close() такого сервера освобождает только последний порт, первый висит до конца процесса.

## Замеры

| Сценарий | Порты процесса |
|---|---|
| свой vite :4431, 9 перезапусков конфига (с открытой страницей и без) | 4431, 4441, 4450 — без изменений |
| createServer + 3 restart, порт свободен | 4433, 4441, 4450 — без изменений |
| порт занят, без strictPort | «Port 4434 is in use», listen завис, занят 4435 |
| порт занят, strictPort | сразу «Port 4434 is already in use» |

Вывод: гипотеза «сдвиг порта шлюза/трансляции» замером не подтверждена. Источник накопления портов — перебор портов vite на Bun (дефекты 1–3). Как именно набралось 4310–4599 и 92065, не воспроизведено: нужен лог sdk.
