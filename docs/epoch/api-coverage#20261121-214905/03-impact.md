# Влияние

- `scanner-source`: screen-calls (два прохода), rr-screens (фабрики объектов роута, загрузчик по id),
  section-dispatch (новый), program (алиасы — влияет и на роуты/вызовы БД бэкенда: vpn-saas 286 → 293 роута),
  scan-source (выбор корней экрана, routeFile).
- `cli`: screenEntries передаёт routeFile (metadata TanStack).
- Карты korbor в git меняются (рёбра api, code.screens); e2e, завязанные на числа (`toHaveCount(314)`, «из 314»), — проверить.
- graph/mcp/visualizer: автоописание — новое поле в выдаче, авторское не меняется.
- Риск: перепривязка (вызов чужого экрана). Меры: порог «общей» фабрики, метод по имени не из чужого стора, проверка выборкой.
