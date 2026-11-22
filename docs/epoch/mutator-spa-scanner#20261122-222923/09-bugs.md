# Найденные баги

## Open

(нет)

## Closed

- Мёртвые запасные значения в SettingsSheet (warmPageIds?.size ?? 0, maxWarmIframes : 8) скрывали бы поломку store — удалены, поля в типе обязательные.
