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

## Вход мини-аппа после простоя, зум, старт живых экранов (2026-11-21)

- Свежая загрузка, ожидание 20 с (auth2.ts): korbor-admin — live 6, iframe 6, «не авторизован» 0; korbor-miniapp — live 6, iframe 6, «не авторизован» 0. Скриншоты: screens/final-korbor-admin.png, screens/final-korbor-miniapp.png.
- Истёкший access recruiter/employer: 401 → /auth/web/refresh 200 → данные, значка нет. Мёртвые access и refresh: 401 → /auth/telegram/miniapp 200, значка нет.
- 16 свежих загрузок обеих карт подряд: 16 × 6 живых (до правки loadSeq — 4 из 16 с нулём). e2e live-start (2 × 4 загрузки) и overlap — проходят.
- Зум (korbor-all, окно с GPU): Tandir на паузе — 59/60/59/60/60 FPS (без правки 56/60/60/40/59); под нагрузкой Tandir (load ≈30 на 10 ядрах) 49–56, пустой холст 56–59 — упор в CPU. Замеры: measurements/zoom-load.json.
- Тесты: bun test inject-script, cookie-jar, gateway (28), flow+lib (177); tsc чистый.
