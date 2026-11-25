# 07 — Журнал

- Свой vite на 4431 (конфиг-обёртка .lam-repro.config.ts), 9 перезапусков — порты стабильны.
- Скрипты Bun в scratchpad: listen после ошибки, двойной listen, close — дефекты 1–3 (см. 02).
- createServer + restart программно (.lam-vite-run.ts) — занятый порт: listen завис, strict — ошибка.
- Тест dev-server-port.test.ts: красный («завис»), strictPort → зелёный.
- Временные .lam-repro.config.ts и .lam-vite-run.ts попали в git через auto-save — удалены этим коммитом.
