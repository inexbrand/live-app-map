---
name: scan-korbor-needs-live-cms
description: scan:korbor без ответа CMS сайта (:16001) молча теряет 9 страниц site-cms — проверять число страниц перед коммитом карт
metadata:
  node_type: memory
  type: project
  originSessionId: 7cdffe41-b509-444e-85eb-be9a4f0a509a
  modified: 2026-11-21T18:19:47.055Z
---

`bun run scan:korbor` берёт страницы сайта из Payload CMS (`http://localhost:16001/api/pages`). Если CMS не ответила, скан не падает, только печатает `[warning] CMS сайта не отвечает`, и korbor-site становится 24 страницы вместо 33 (Сайт 4 экрана вместо 13). Из-за этого падает smoke.e2e «site map >10». Так было 2026-11-21: коммит 40140e8, исправлено в f039235.

**Why:** warning легко потерять, если обрезать вывод `tail`, а битая карта уходит в git.

**How to apply:** перед сканом — `curl localhost:16001/api/pages?limit=1`; после — `grep warning` в выводе и сверка страниц korbor-site (33). См. [[korbor-local-run]].
