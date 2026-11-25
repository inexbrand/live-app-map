# 07 — Журнал

- Хук auto-save закоммитил мои правки раньше меня: overlap (eb53933), node-scroll, view-scroll, ApiView, stream-server.test (a340421), stream-server.ts (5a923a0). Причины по файлам — здесь и в 02.
- Свои коммиты: stream-page + ux-flows, удаление временных .lam-probe.ts/.lam-vite-run.ts.
- Мешали: HMR App.tsx от других агентов (07:06:55) сбрасывал выбор посреди теста; правки vite.config другими — перезапуски, мой dev падал с EBADF watch (сообщено лиду).
- Побочно: при наложенных перезапусках vite процесс держал 4533 и 4534 (две трансляции) — гонка в stream-plugin, сообщено лиду.
