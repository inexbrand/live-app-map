---
name: korbor-local-run
description: "Как поднять korbor локально для живой карты: без бота, MinIO другим образом, site требует apps/site/.env и seed"
metadata:
  node_type: memory
  type: project
  originSessionId: 0f2bc961-54cb-441d-9cd1-5e4f7900c9a6
  modified: 2026-11-21T12:59:19.117Z
---

На 2026-11-21 korbor (/Users/macbook/orca/korbor) поднимается так: Postgres/Redis уже в docker (korbor-postgres-1 :16432, korbor-redis-1 :16379), миграции 61/61. `docker compose up minio` падает — образов minio/minio и minio/mc нет в Docker Hub; поднят `cgr.dev/chainguard/minio` контейнером korbor-minio-local на 16900/16901 с томом korbor_minio. `scripts/dev.ts` запускает и бота — с боевым BOT_TOKEN long-polling перехватит апдейты, поэтому apps запускаются по одному через лаунчер с той же подготовкой env (без bot). Site (Next+Payload) падает 500 без `apps/site/.env` (PAYLOAD_SECRET, gitignored) и отдаёт 404 на / до `bun run db:migrate && bun run seed` в apps/site (SQLite CMS).

**Why:** без этого живые iframe site пустые, а бот мог бы мешать продовому.

**How to apply:** перед живой проверкой карты korbor — curl 16000/health, 16001/, 16002/, https://vite.localhost:5175/. На :4310 может висеть визуализатор другого worktree (elephantfish) — свой тогда встаёт на 4311. См. [[korbor-frontend-api-clients]].
