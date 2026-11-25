# Баги

- [closed] Вид «Компоненты» — сделан, проверен живьём на фикстуре (08).
- [info, не моя зона] Визуализатор :4310 (pid 20376, 2026-11-25 04:30) слушал порты 4310–4599 — утечка портов трансляции; после перезапуска освобождены. Сообщено лиду.
- [info] На korbor вкладка заработает, когда лид подключит lamVite в apps/miniapp/vite.config.ts (без плагина /@lam/component на :5175 даёт SPA-страницу).
- [closed] e2e comments: пикер на странице — ReferenceError componentNameOf2 (переименование импорта sdk сборщиком vite.config после 715945c). Починка renamedImportAliases, тест pick-script.bundle.test.ts (a340421).
- [closed] e2e snapshot: POST /api/comments висел — сотня img /__lam_snapshot занимала 6 соединений браузера. Очередь snapshot-slots (eb53933).
- [closed] e2e W/request_snapshot: StrictMode грузил карту дважды, вторая loadDocument сбрасывала выбор. Отмена в applyLocationParams, тест app.test.tsx (45430b5).
- [closed] e2e: правки e2e другими агентами давали page reload — server.watch.ignored (eb53933).
- [open, зона states] screenPage (c8745dc, точный hash) не находит вкладку miniapp:route:/ — мини-апп уходит на #/feed; по URL вкладку не определить. Предложено пометить вкладку ключом экрана. Ждёт решения лида.
- [open, общий конфиг] fullyParallel + один сервер трансляции и agent-state: тесты разных файлов мешают друг другу. Предложено workers: 1.
