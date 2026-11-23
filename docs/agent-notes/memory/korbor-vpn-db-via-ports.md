---
name: korbor-vpn-db-via-ports
description: "В korbor и vpn-saas роуты Elysia ходят в БД через интерфейсы-порты, не напрямую — сканеру нужно разрешать реализации"
metadata:
  node_type: memory
  type: project
  originSessionId: c9b94e2a-f151-48db-8d58-b15c0c33920a
  modified: 2026-11-20T13:32:56.472Z
---

Роуты Elysia в korbor (`apps/api`) и vpn-saas почти не вызывают Drizzle в самом обработчике: запросы живут в портах/репозиториях (`interface XRepository` + фабрика `createDrizzleXRepository(db): XRepository { return { … } }`, реже `class … implements`). Описание роута чаще в шапке файла (``GET /api/v1/… — блок 050-….md``), а не у вызова `.get`.

**Why:** без разрешения реализаций интерфейсов сканер `@live-app-map/scanner-source` видел вызовы БД у 34 из 260 роутов korbor, с ним — у 221 (2026-11-20).

**How to apply:** при правке сканера исходников проверять цифры `bun run packages/cli/src/bin.ts code --dir /Users/macbook/orca/korbor` (роуты / с БД / с описанием), а не только фикстуру. См. [[live-app-map-master-broken-2026-11]].
