# Журнал

- 2026-11-24: замер listComments (scratchpad bench): 100 веток — 29–35 мс / 82 КБ, 1000 — 249–567 мс / 822 КБ на каждый опрос в 3 с.
- Решение пользователя: файлы .lam-feedback + SSE, до ~50 веток — сводку и кэш не делаем.
- Тест (красный → зелёный): comments-middleware.test «поток: запись агента по MCP приходит событием changed».
- lib/comments-stream.ts: одно fs.watch(recursive) на папку comments для всех вкладок, слияние записей за 120 мс в одно событие, ping раз в 25 с, наблюдение закрывается с последним клиентом.
- comments-middleware: GET /api/comments/stream.
- use-comments: EventSource вместо setInterval(3000); ready → перечитать (догон после переподключения), changed → перечитать.
- test/dom.ts: тихий EventSource (в happy-dom его нет); use-comments.test — свой поддельный EventSource, проверка changed → перечитано, unmount → закрыт.
- Снимок: уже снимается только область компонента (padRect 8 px) — не менял; предел 15 МБ общий с agent-state.
