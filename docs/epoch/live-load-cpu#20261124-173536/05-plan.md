# План: трансляция вместо iframe (цель пользователя 2026-11-24)

Цель (дословно): «в полной мере всё реализовать 1, 12 экранов пусть стандарт будет и iframe не нужен тогда раз он не работает нормально».

1. lib/stream/stream-protocol.ts — чистое: кадр (ключ + JPEG), разбор сообщений клиента, план сверки набора экранов, точка страницы из точки экрана, какие сообщения страницы идут карте.
2. lib/stream/stream-service.ts — headless Helium: страница на смонтированный экран, трансляция у живых, мост postMessage (страница ↔ карта), ввод мыши/колеса/клавиш. Тест на настоящем Helium.
3. lib/stream/stream-server.ts — Bun.serve WebSocket (порт LAM_STREAM_PORT, 4321+), vite-plugin: запуск, /__lam_stream → порт.
4. Клиент: lib/stream/stream-client.ts, use-stream-sync.ts, flow/page-node/ScreenView.tsx (canvas: живой — кадры, не живой — последний кадр, нет кадра — снимок шлюза).
   Перевод: use-gateway-frames (отчёты), use-comments (пикер, подсветка), use-wheel-to-page (колесо).
   Удаление: LiveFrame, sandbox-пресеты, measure-iframe-height, подмена при зуме, снимок под iframe, масштабный порог живости.
   По умолчанию 12 живых (DEFAULT_MAX_LIVE).
5. Проверка: тесты пакета, tsc, Helium: нет iframe в DOM, 12 транслируются, движение 180 кадров/с, клик/ввод доходят, пикер создаёт черновик замечания.
