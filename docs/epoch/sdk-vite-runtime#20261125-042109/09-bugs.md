# Баги

- [closed] Вид «Компоненты» — сделан, проверен живьём на фикстуре (08).
- [info, не моя зона] Визуализатор :4310 (pid 20376, 2026-11-25 04:30) слушал порты 4310–4599 — утечка портов трансляции; после перезапуска освобождены. Сообщено лиду.
- [info] На korbor вкладка заработает, когда лид подключит lamVite в apps/miniapp/vite.config.ts (без плагина /@lam/component на :5175 даёт SPA-страницу).
- [closed] e2e comments: пикер на странице — ReferenceError componentNameOf2 (переименование импорта sdk сборщиком vite.config после 715945c). Починка renamedImportAliases, тест pick-script.bundle.test.ts (a340421).
- [closed] e2e snapshot: POST /api/comments висел — сотня img /__lam_snapshot занимала 6 соединений браузера. Очередь snapshot-slots (eb53933).
- [closed] e2e W/request_snapshot: StrictMode грузил карту дважды, вторая loadDocument сбрасывала выбор. Отмена в applyLocationParams, тест app.test.tsx (45430b5).
- [closed] e2e: правки e2e другими агентами давали page reload — server.watch.ignored (eb53933).
- [closed] screenPage не находил вкладку miniapp:route:/ (редирект на #/feed) — вкладка помечена ключом экрана window.__lamScreenKey, поиск по ключу (a8675f4).
- [closed] fullyParallel + общий сервер трансляции — лид поставил workers: 1, fullyParallel: false.
- [closed] Клик сразу после перезагрузки страницы уходил приложению: выбор включается по отчёту загрузки (27228a6); e2e кликает после рамки выбора (228963d). Итог: snapshot+comments 2 прогона подряд 4/4.
