---
name: visualizer-db-studio
description: "Вид «База данных» как Drizzle Studio — почему схема BT, откуда код объявления, где тест живых данных, грабли фокуса"
metadata:
  node_type: memory
  type: project
  originSessionId: 2af31436-1760-4e5f-b140-98ed236351ce
  modified: 2026-11-25T08:50:07.225Z
---

Вид «База данных» (2026-11-25, эпоха db-studio): список | ER-схема над сеткой данных | справа «Документация»/«Схема в коде», панели react-resizable-panels 4 (числа — px, строки — %), раскладка в localStorage.

- ER-схема — dagre **BT**, не LR: на 75 таблицах korbor LR дал 3300×12758 (узкая колонна, «вписать» показывает мелочь), BT — 12636×5436. Таблицы без связей (14) — рядами под схемой.
- Код объявления — `GET /__lam_project/source?file=&line=`: в карте у таблицы только строка начала, конец ищет сервер разбором TypeScript.
- Замечание к таблице — `anchor.code` + pageId `db:<exportName>` в общем /api/comments.
- CommentField по умолчанию забирает фокус — внизу длинной панели это прокручивает её мимо кода: там `autoFocus={false}`.
- Живые тесты сервера /__lam_db — под `LAM_TEST_DATABASE_URL` (без него 12 skip), см. [[postgres-js-params-text]]. Подъём БД korbor — [[korbor-local-run]].

- Живая правка данных korbor — только `ux_activity_events` (route/target, jsonb meta; вставка со своим id и удаление его же). `users`/`accounts` — две настоящие записи входа, не трогать (2026-11-25 правил их по ошибке, всё вернул).

**Why:** раскладка и фокус нашлись только живой проверкой, тесты их не ловили.
**How to apply:** правишь схему или правую панель — смотри живьём на korbor (75 таблиц), не на срезе в 3 таблицы.
