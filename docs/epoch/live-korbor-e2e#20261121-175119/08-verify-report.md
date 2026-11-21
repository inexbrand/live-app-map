# Verify report

## Тесты

- gateway 23, flow 29, db-view-model 4, scanner-react-router 22 — все проходят.
- e2e overlap 3 — проходят; без RevealSelected падают («.drawer × выбранная нода»).
- tsc visualizer-spa и scanner-react-router — без ошибок.

## Живая проверка на korbor (скриншоты в `screens/`)

| Что | Результат | Скриншот |
|---|---|---|
| Холст со старта | группа «Мини-приложение», ноды читаемы | canvas-start-readable.png |
| Живые экраны под рекрутером | лента, кошелёк, чаты, заявки — каждый в своей ячейке | canvas-miniapp-live-isolated.png |
| Админка под admin | метрики с данными | admin-metrics-live.png, admin-with-profile.png |
| Без профиля админа | 6/6 живых экранов «не авторизован (403 /api/v1/auth/admin/refresh)»; профиль восстановлен — 0 | admin-no-profile-unauthorized.png |
| Обрезка | «Видно 844 из 5838 px» → «целиком» 5838 px без метки → обратно 844 с меткой | node-window-cropped-badge.png, node-full-height.png |
| Профили | панель, роли recruiter / employer / admin | session-profiles-panel.png |
| БД | vacancies: 29 колонок, 10 ссылок, 22 чтения, 5 записей, 0 iframe | db-vacancies-*.png |
| vpn-saas miniapp | 18 экранов, 13 переходов | vpn-saas-miniapp-tanstack-map.png |

## Память (memory-ab.json, куча вкладки после GC, одна сборка)

| | старт | обзор | после 8 переключений карт |
|---|---|---|---|
| было (live 8, warm 8, без снимков) | 155 МБ | 180 МБ | 153 МБ |
| стало | 134 МБ | 140 МБ | 131 МБ |

iframe в обзоре 7 → 5 (+44 снимка), кэш снимков 53 файла / 1 МБ. RSS шумит (210–680 МБ) —
как доказательство не используется.

## FPS (fps.json)

- Пан: 60 FPS в окне с GPU, 57–60 headless.
- Зум: 40–47 FPS в окне (холодные снимки — 15–26). Главный поток при зуме простаивает,
  узкое место — композитор. Машина под нагрузкой Tandir (load ~60) — цифры занижены.

## Не сделано / долги

- Зум не дотягивает до 60 FPS (40–47) — упирается в композитор при множестве слоёв iframe.
- Файлы больше 300 строк, которые были большими и раньше: app-store.ts, MapToolbar.tsx,
  PageNode.tsx — не делил, чтобы не смешивать с задачей.
- Ссылки через переменные (`to: path`, `ADMINS_CREATE_PATH`) TanStack-сканер не видит —
  в vpn-saas admin 12 экранов без переходов.
