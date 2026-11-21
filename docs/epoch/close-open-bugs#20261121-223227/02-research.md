# Исследование

## Как устроено

- `packages/graph` — `diffDocuments(left, right)`: ноды (added/removed/changed по pathPattern/url/title/kind) и рёбра по id. Нет роутов и таблиц из `code`. Используется CLI `diff`.
- Карты — `apps/visualizer-spa/public/maps/*.liveappmap.json`, в git: версии карты = история файла. korbor-* пишет `scripts/scan-korbor.ts` (канон `maps/` + копия в public), live-app-map — `cli code --dir . --format liveappmap`.
- Документация — `packages/scanner-docs`: `openBugItems` считает открытыми `- [ ]` и пункты списка в разделе «Open/Открытые»; готовность эпохи — в `readEpoch`. В карте docs — снимок, корень абсолютный (`docs.root`).
- Dev-сервер (vite.config.ts) — middleware `/__lam_docs/asset` и др.; записи на диск для docs нет.
- Сканер входа роутов — `scanner-source/src/route-input.ts`: поля только у верхнего `t.Object({...})`. В korbor-all 25 из 187 схем без полей: `t.Optional(t.Object(...))` (обёртка), `t.Record`, `t.Unknown`; вложенные объекты — тип `object`/имя константы без полей.
- Карточка роута (ApiView) печатает «Elysia t» и сырой текст, когда полей нет.
- Селект карты (MapToolbar) после импорта файла остаётся на `''` → «Выберите карту…».
- `gateway-store.loadSamples`: множество `requested` пополняется до запроса и не чистится при ошибке → повтора нет до перезагрузки.

## Покрытие (что должна уметь система сравнения/отметки)

| Нужно | Было |
|---|---|
| Сравнить две версии карты | только CLI diff нод/рёбер |
| Роуты/таблицы в diff | нет |
| Свежий скан для сравнения | нет |
| Запись в 09-bugs | нет, только чтение |
| Живые docs с диска | нет (снимок в карте) |
