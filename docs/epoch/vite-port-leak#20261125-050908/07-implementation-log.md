# 07 — Журнал

- Свой vite на 4431 (конфиг-обёртка .lam-repro.config.ts), 9 перезапусков — порты стабильны.
- Скрипты Bun в scratchpad: listen после ошибки, двойной listen, close — дефекты 1–3 (см. 02).
- createServer + restart программно (.lam-vite-run.ts) — занятый порт: listen завис, strict — ошибка.
- Тест dev-server-port.test.ts: красный («завис»), strictPort → зелёный.
- Временные .lam-repro.config.ts и .lam-vite-run.ts попали в git через auto-save — удалены этим коммитом.
- (install) dev-server-restart.test.ts: настоящий createServer, конфиг-обёртка во временной папке (правка не трогает общий :4310), 5 записей с шагом 120 мс → красный: 2× «Port 51605 is already in use».
- (install) serial-restart-plugin.ts + подключение в vite.config.ts → зелёный; юнит-тест очереди (по очереди, слияние, упавший перезапуск не стопорит).
- (install) Живьём: `bun run dev -- --project ../korbor --port 4541 --config <обёртка>` (шлюз 4542, трансляция 4543), 10 правок по 100 мс и 30 по 30 мс: сервер отвечает 200, 23 перезапуска, ошибок порта 0, процесс слушает те же 4541/4542/4543.
