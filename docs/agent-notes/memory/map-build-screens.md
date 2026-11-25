---
name: map-build-screens
description: "Приложения на карте — сборка map-serve (bun run dev -- --map в korbor), а не dev-серверы; грабли сборки"
metadata:
  node_type: memory
  type: project
  originSessionId: 4cffdc2b-4185-4f5f-bcc7-099228f97712
  modified: 2026-11-25T13:33:33.178Z
---

С 2026-11-25 korbor для карты запускается `bun run dev -- --map`: miniapp/admin — `serveMapApp` (packages/sdk/src/map-serve.ts:
vite build --watch с NODE_ENV=development, minify: false, sourcemap + vite preview на том же порту), сайт — scripts/dev-map-site.ts
в korbor (next build/next start за прокси, .next-map-a/b по очереди). Экраны перезагружаются опросом /@lam/build-id.

**Why:** dev-сервер Vite отдаёт ~600 модулей на экран — 8 экранов админки 4880 запросов и 36–38 с CPU, бандл ~105 и 20–24 с. Пользователь
хотел «продакшен на localhost с перезапуском при правке».

**How to apply:**
- Прод-React нельзя: пропадут пикер (_debugStack), имена компонентов, вход dogfood (import.meta.env.DEV). Сжатие тоже нельзя — имена.
- Файл компонента в бандле — только по sourcemap (sdk runtime/sourcemap.ts, общий с пикером); кадры из node_modules пропускаются.
- SSE для перезагрузки не использовать: общий origin экранов роли + лимит 6 соединений HTTP/1.1.
- inline-конфиг serveMapApp — функция: общие экземпляры плагинов у build и preview ломают пересборку.
- SDK в korbor ставится из релиза sdk-v<версия> — после правок SDK: версия, pack, gh release, ссылка в apps/miniapp/package.json.
См. [[visualizer-stream-screens]], [[install-sh-and-sdk-tarball]], [[wasm-not-a-fix]].
