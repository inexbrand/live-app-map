# Что сделано

## Изменения

- 28f978c, 40140e8 — scanner-source: полная схема входа (Object, Optional, Nullable, Array, Partial, Intersect/Composite, Record, константы по имени, пустой объект — «{}»); schema: поля `rules`, `fields`, `optional`, `type`; ApiView — дерево полей.
- 62c6694 — graph: `diffMaps` по нодам, связям, роутам (поля входа, доступа, ответа, вызовов БД, описания) и таблицам (колонки); CLI `diff` на нём; фикстура source-schemas.
- bec2c78 — dev-эндпоинты `/__lam_maps/versions`, `/version`, POST `/scan` (свежий скан во временный каталог, один на карту).
- 67cddbe — вид «Сравнение»: «Было»/«Стало» — открытая карта, файл на диске, коммит, свежий скан, файл с компьютера; разделы экраны/роуты/таблицы/связи/ноды; переход к роуту и таблице.
- 17be2ec — scanner-docs: `bugItems`, `setBugItemState` (правка markdown на месте, идемпотентно).
- b9f5dbc — «Документация»: живые docs с диска, кнопки «Закрыть»/«Открыть» с подтверждением, готовность эпохи пересчитывается; селект карт после импорта — «Файл: <имя>».
- 9c31502 — повтор неудачного sample-ids (SampleRequestLog).
- 9a6b260 — overlap.e2e ждёт устоявшийся вид.
- f039235 — карты пересканированы при живой CMS сайта (первый перескан потерял 9 страниц CMS).
- 0abe2c7 — раскладка крупной группы не столбцом; route-params.e2e через поиск.
- последний коммит — 400 вместо подстановки при пустом id/root; 09-bugs четырёх эпох закрыты.

## Команды проверки

- `bun run typecheck` в schema, graph, scanner-source, scanner-docs, cli, visualizer-spa — все exit 0.
- `bun test packages/schema packages/graph packages/scanner-source packages/scanner-docs packages/cli apps/visualizer-spa/src scripts` — 480 pass, 0 fail.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4312 PLAYWRIGHT_SKIP_WEBSERVER=1 bunx playwright test` — 31 passed.
- `overlap.e2e --repeat-each=5 --workers=8` — 15/15.

## Не сделано

(пусто)
