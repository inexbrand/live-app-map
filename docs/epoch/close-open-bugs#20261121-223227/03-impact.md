# Влияние

- `AppMapDiff` расширяется полями routes/tables — CLI `diff` печатает больше, счётчик изменений учитывает новые разделы.
- Схема `RouteSchemaField`/`RouteInputSchema` — новые необязательные поля (`fields`, `optional`, `rules`): старые карты валидны; zod-граница обновляется.
- Новый вид `compare` в nav-location/view-store — ссылки старых видов не меняются.
- Запись на диск: только `docs/epoch/*/09-bugs.md` внутри корня, корень должен быть корнем docs одной из карт каталога.
- Риск: перескан korbor-карт меняет большие JSON — пересобрать карты и verify-korbor-maps.
