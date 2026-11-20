# Проверка

- `bun run typecheck` — 16 пакетов, 0 ошибок.
- `bun test packages/schema packages/scanner-source packages/cli` — 79 pass / 0 fail.
- `bun test apps/visualizer-spa/src` — 180 pass / 0 fail.
- Реальные проекты (только чтение):

| Проект | Роутов | Вызовов API | Сопоставлено | Время скана |
|---|---|---|---|---|
| korbor | 314 | 288 | 270 (94%) | 6,0 с |
| vpn-saas | 286 | 212 | 207 (98%) | 5,6 с |

  korbor, несопоставленные 18: 11 — мобильный чат/поддержка с `/:surface/` (employer|recruiter), 6 — скрипты e2e/ngrok (не API), 1 — роут `POST /admin/registry/:name/:id`, которого нет. vpn-saas, 5: 4 `POST /api/*/bulk` (роуты регистрируются не литералом), 1 — Docker API в node-agent.
- Экраны: korbor miniapp — 11 из 20 экранов со связями, 13 рёбер api; admin — 0 (конфиг роутов без компонентов), site — 0 (Next + Payload, в API не ходит). vpn-saas — экранов RR/Next нет (админка на TanStack Router), вызовы считаются по репозиторию.
- Живой UI: `bun run dev`, Playwright, карта korbor miniapp: экран /vacancies/[id] — «Вызовы API · 14» с сервисом, путём роута и запросами в БД; «К роуту» открывает @korbor/api с выделенным роутом и строкой «Экраны: …»; ошибок в консоли нет.
