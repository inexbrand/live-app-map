---
name: postgres-js-params-text
description: "postgres.js в /__lam_db — параметры только как $n::text::<тип>, ORDER BY с приставкой таблицы; живые тесты в песочнице lam_test_"
metadata:
  node_type: memory
  type: project
  originSessionId: 2af31436-1760-4e5f-b140-98ed236351ce
  modified: 2026-11-25T08:36:36.673Z
---

Сервер живых данных БД (`apps/visualizer-spa/src/lib/db-data/`) шлёт значения ячеек текстом.
postgres.js готовит запрос и сериализует параметр по типу, который вернул сервер: для `$1::jsonb` строка
уходит JSON-строкой (в базе — jsonb-строка, не объект), для bool `'true'` превращается в `f`. Поэтому
приведение — `$n::text::<format_type(oid, NULL)>`. Второе: в `SELECT col::text AS col … ORDER BY col`
голое имя берёт колонку вывода — сортировка по тексту (11 раньше 2); нужно `t.col`.

**Why:** оба бага прошли юнит-тесты сборки SQL и нашлись только живым тестом против Postgres korbor (2026-11-25).
**How to apply:** правки SQL в db-data проверять `db-live.test.ts` с `LAM_TEST_DATABASE_URL` = DATABASE_URL из
`C:\work\korbor\dev.local.env` (значение не печатать); тест работает в схеме lam_test_<rand> и удаляет её.
См. [[korbor-local-run]].
