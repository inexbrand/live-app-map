---
name: korbor-local-run
description: "Как поднять korbor локально (Windows, C:/work/korbor): Docker Desktop, chainguard MinIO с --user 0, миграции с DATABASE_URL, dev без бота"
metadata:
  node_type: memory
  type: project
  modified: 2026-11-24T12:17:21.966Z
  originSessionId: f757e4b2-22ea-4772-bc19-f10da4e0a6de
---

С 2026-11-24 машина — Windows, korbor в `C:/work/korbor`. Порядок:
1. Docker Desktop сам не стартует — `Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'`, ждать `docker info`.
2. `docker start korbor-postgres-1 korbor-redis-1` (:16432, :16379).
3. MinIO: `minio/minio` и `minio/mc` удалены из Docker Hub. Контейнер `korbor-minio-local` на `cgr.dev/chainguard/minio`, порты 16900/16901, том `korbor_minio`, ключи = S3_ACCESS_KEY/S3_SECRET_KEY из `dev.local.env`, `--user 0` (иначе «file access denied» на новом томе), `--restart unless-stopped`. Бакет `korbor` — образом `cgr.dev/chainguard/minio-client` с `MC_HOST_local`.
4. Миграции: корневого `.env` нет, `bun run db:migrate` падает «DATABASE_URL is required» — передать DATABASE_URL из `dev.local.env`.
5. `bun run dev --without=bot` — бот не запускаем: long-polling того же токена с другой машины даст конфликт.
Проверка: 16000/health, 16001/, 16002/, https://vite.localhost:5175/, 16003/ — все 200. Известные ошибки лога: site «не задан SITE_API_BASE_URL» (юр. документы), api «settings.invalid_rows_using_default OFD_PACKAGE_CODE».

**Why:** каждый шаг выше стоил отдельной ошибки при подъёме.
**How to apply:** перед живой проверкой карты korbor пройти список; site без `apps/site/.env` и seed — см. историю в git этого файла. См. [[lam-dev-auth-autologin]], [[helium-browser-mcp]].
