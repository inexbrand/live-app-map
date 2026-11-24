---
name: scan-korbor-needs-live-cms
description: скан проекта korbor без ответа CMS сайта (:16001) теряет 9 страниц сайта — проверять byApp.site = 13
metadata:
  node_type: memory
  type: project
  originSessionId: 7cdffe41-b509-444e-85eb-be9a4f0a509a
  modified: 2026-11-24T23:51:01.122Z
---

`bun run scan -- --project ../korbor` (и обёртка `scan:korbor`) берёт страницы сайта из Payload CMS
(`http://localhost:16001/api/pages?locale=all`). CMS не ответила — скан не падает, пишет в stderr
`[warning] site: CMS не отвечает`, в сводке `warnings`, у сайта 4 экрана вместо 13 (всего 82 вместо 91).
Без `locale` Payload отдаёт заголовки пустыми (поле локализовано) — поэтому `locale=all`.

**Why:** 2026-11-21 битая карта ушла в git (40140e8 → f039235); warning легко потерять, обрезав вывод.

**How to apply:** перед сканом — `curl localhost:16001/api/pages?limit=1`; после — `warnings` пуст и
`byApp.site` = 13, `screens` = 91. См. [[korbor-local-run]], [[project-folder-map]].
