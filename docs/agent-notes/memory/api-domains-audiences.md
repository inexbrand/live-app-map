---
name: api-domains-audiences
description: Вид «API» группирует роуты по доменам; аудитории (admin/employer/recruiter) узнаются по данным
metadata:
  node_type: memory
  type: project
  originSessionId: a29e1f25-91b1-41ef-8592-902a7bd0f8c8
  modified: 2026-11-23T13:45:10.920Z
---

Пользователь (2026-11-23): в виде «API» не нужны сервисы и пакеты — только роуты по доменам, по клику — доска роута (документация, таблицы БД, поля входа, что меняет, что отдаёт, параметры и query).

Домен считает `apiDomains` (`packages/graph/src/api-domains.ts`): раздел после `/api/vN` — аудитория, если 2+ его модуля встречаются в других разделах; тогда домен — модуль. На korbor: admin/recruiter/employer — аудитории, auth — домен.

**Why:** у korbor все роуты в одном сервисе `@korbor/api`, а первый сегмент пути — роль, а не предмет.
**How to apply:** не возвращать группировку сервис → раздел в этот вид; порог менять только со сверкой на `maps/korbor-all.liveappmap.json`. Связано: [[korbor-frontend-api-clients]].
