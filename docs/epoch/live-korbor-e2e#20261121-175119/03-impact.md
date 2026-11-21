# Impact

- `store/app-store.ts` resolveLiveUrl: при поднятом шлюзе адрес идёт через него; без шлюза
  (сборка, тесты) — старый путь. Риск: dev без шлюза — проверено, путь сохранён.
- `packages/iframe-policy`: DEFAULT_MAX_LIVE 8 → 6, DEFAULT_MAX_WARM 8 → 2 — тест visualizer обновлён.
- `scripts/scan-korbor.ts`: заголовок страницы без префикса поверхности — карты пересканированы.
- `scanner-react-router`: TanStack-ветка срабатывает только при найденных createRoute /
  createFileRoute из `@tanstack/react-router`; React Router-проекты идут старым путём
  (интеграционные тесты пакета проходят).
- Шлюз снимает XFO/CSP и не проверяет TLS цели — только для dev, слушает localhost.
