# Карты korbor для тестов

Срезы настоящих карт korbor (скан 2026-11-24, до переезда карты в `korbor/.live-app-map/map.json`):
все экраны, рёбра и экраны кода; у `korbor-miniapp` и `korbor-all` — все роуты, таблицы и вызовы API,
у `korbor-admin` и `korbor-site` — роуты экранов, по одному на домен и первые 25; документация —
4 эпохи и 2 руководства (у `korbor-all` — вся). Читают тесты визуализатора (`src/test/fixtures.ts`)
и mcp-server. Живая карта проекта — `bun run scan -- --project ../korbor`.
