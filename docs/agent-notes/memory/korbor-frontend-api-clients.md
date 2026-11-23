---
name: korbor-frontend-api-clients
description: Как фронтенды korbor и vpn-saas вызывают API и как сканер связывает экран → роут (корни, фабрики, DI-fetch)
metadata:
  node_type: memory
  type: project
  originSessionId: c9b94e2a-f151-48db-8d58-b15c0c33920a
  modified: 2026-11-21T17:15:39.291Z
---

korbor: admin — `api.post('/api/v1/…')` через интерфейс `AdminApiClient` (фабрика поверх внедрённого `fetchWithAuth`), сторы споров/очереди/поддержки зовут `fetchWithAuth(путь)` параметром напрямую, есть `api.getRaw(путь)`; admin route-config — данные без компонентов, экран выбирает `switch (section)` в routing.tsx. miniapp — `apiClient.request(path, { method })`, фабрики `createXApiClient(client)`/`createXStore` под `useMemo`; RR-конфиг с `lazy: lazyRoute('id')`, табы `element: null` → загрузчик по id. mobile — билдеры `{ path, method }`, экранов в карте нет. vpn-saas admin — `apiFetch(schema, path, …)`, TanStack (`metadata.routeFile`, loader), алиасы `@/`; miniapp — `${origin}/api/…`.

Правила сканера (PR api-coverage, 2026-11-21): фабрика обходится целиком, если её достигает ≤ max(2, ¼) экранов сервиса; метод по имени — только из своей фабрики экрана или внедрённой; switch-диспетчер — если совпал ≥ 2 разделами конфига; fetch-параметр с именем fetch*/…Fetch — как fetch; `getX(путь)` — только если первый аргумент литерал `/…`.

**Why:** без node_modules типы хуков и клиентов не видны — связи строятся эвристиками, и каждая ослабленная эвристика давала ложные связи (экран вакансий ↔ стор выплат).

**How to apply:** после правки поиска вызовов — `KORBOR_DIR=/Users/macbook/orca/korbor bun run scan:korbor` и цифры: на 2026-11-21 korbor-all роутов с экранами 200/314, вызовов 318, экранов со связями 76/77; vpn admin 165/293. Остаток без экранов перепроверять grep-ом клиентского кода. См. [[korbor-vpn-db-via-ports]].
