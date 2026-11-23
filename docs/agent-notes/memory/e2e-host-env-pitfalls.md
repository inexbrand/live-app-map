---
name: e2e-host-env-pitfalls
description: "e2e live-app-map краснеют от машины: OrbStack завис после обрыва сети, звуковой выход NDI Audio глушит AudioContext"
metadata:
  node_type: memory
  type: project
  originSessionId: 7ca88fda-a902-46ae-bb85-e3043e536f91
  modified: 2026-11-22T17:26:26.989Z
---

2026-11-22 (задача crap-under-10):
- После обрыва сети/перезагрузки OrbStack может зависнуть: порт Postgres korbor :16432 открыт, но запросы висят, `docker ps` висит. Признак: API korbor отвечает health 200, а вход мини-аппа (POST /api/v1/auth/telegram/miniapp) — таймаут; в e2e красные route-params и node-scroll. Лечение: `orb stop; orb start`, затем `docker start korbor-postgres-1 korbor-redis-1 korbor-minio-local` (сами не поднимаются) и перезапуск korbor.
- Korbor без бота: копия korbor/scripts/dev.ts с APPS без bot и call, абсолютный импорт dev-ports, ROOT = /Users/macbook/orca/korbor, запуск из каталога korbor.
- Системный вывод звука «NDI Audio» (виртуальный) останавливает часы AudioContext в Chromium — фейковый микрофон даёт тишину, voice.e2e пустой текст. С PR #17 проект voice запускает Chromium с --disable-audio-output.
- Headless Chromium Playwright без флагов не даёт WebGPU-адаптер — Whisper в e2e идёт на wasm (это нормально).

**Why:** часы ушли на поиск «поломок», которых нет в коде.
**How to apply:** красный e2e после перезагрузки — сначала curl входа мини-аппа и проба микрофона, потом код. См. [[worktree-git-and-korbor-scan]], [[korbor-local-run]].
