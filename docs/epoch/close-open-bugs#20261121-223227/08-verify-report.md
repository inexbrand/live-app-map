# Проверка построчно

## Чеклист brief

- [x] Сравнение карт в интерфейсе: две версии или карта против свежего скана; добавилось/пропало/изменилось по экранам, роутам, таблицам, связям; diff из пакета graph — compare.e2e (2 теста), screens/compare-commit-vs-scan.png, screens/compare-file-vs-open.png.
- [x] Отметка пункта 09-bugs из «Документации» с записью в markdown через dev-сервер, с подтверждением, готовность пересчитывается — docs-bugs.e2e (точное содержимое файла после закрытия и открытия), screens/docs-bug-confirm.png, screens/docs-bug-closed.png.
- [x] Полная схема входа роута вместо «Elysia t» — route-input.test; korbor-all: 187 схем, непрозрачных 0, с вложенными полями 10.
- [x] Селект после импорта — docs-bugs.e2e проверяет «Файл: demo.liveappmap.json».
- [x] Повтор sample-ids — sample-retry.test.
- [x] Остальные пункты — починены (overlap, раскладка) или обоснованы (06-decisions).
- [x] Весь e2e зелёный — 31 passed.
- [x] Typecheck чистый — 6 пакетов.
- [x] 09-bugs эпох закрыты — scanDocs: ux-overhaul, api-coverage, e2e-green, minimap-overflow, close-open-bugs — readiness ready, openBugs [].

## Тесты: реальные вызовы?

- Middleware — настоящий HTTP-сервер и настоящий git-репозиторий / файлы во временном каталоге.
- compare-view-model, pack-layout — настоящая карта korbor-all.
- route-input — настоящий сканер на фикстуре.
- e2e — настоящий dev-сервер :4312 и живой korbor (route-params, live-start).

## Замечания

- В репозитории нет линтера; «lint» — typecheck плюс проверка запретов пользователя по изменённым файлам. `as const` остался только в старых строках scripts/scan-korbor.ts (не из этой задачи).
- Скан korbor без живой CMS сайта молча теряет страницы CMS (печатает warning). Карты в этом PR сняты при живой CMS.

## Баги

См. 09-bugs.md
