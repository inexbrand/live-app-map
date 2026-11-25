# 04 — Тесты

`src/lib/dev-server-port.test.ts`: настоящий `createServer` vite с `vite.config.ts`, порт занят Bun.serve → listen() сразу отклоняется с «Port N is already in use», соседний порт свободен. Порты шлюза и трансляции — свободные, не общие.
