# Журнал

| Шаг | Что и почему | Проверка |
|---|---|---|
| Ресерч | Цифры до, 6 причин (02-research) | stats-скрипт по картам |
| Фикстура | admin + miniapp-случаи, тесты красные по ожидаемой причине (пустые экраны) | api-calls.test 6 fail |
| Корни экрана | tabRoute/загрузчик по id, switch-диспетчер (≥ 2 раздела конфига), файл страницы | тесты зелёные |
| Фабрики | второй проход: фабрика ≤ ¼ экранов сервиса обходится целиком | korbor 29 → 183 |
| Метод по имени | только фабрика экрана или внедрённая; чужой стор — нет (вакансии цепляли выплаты) | тест падал без фикса |
| Алиасы | paths ближайшего tsconfig | тест падал без фикса; 184 |
| TanStack | файл на два маршрута → сам файл; loader из routeFile | vpn admin 0 → 165 |
| Origin-параметр | `${origin}/api` → путь; голова шаблона — пустой литерал | vpn miniapp 0 → 25 |
| Ответ роута | `routeResponse`: поля, значения, статусы (Elysia, Hono, Express) | route-response.test |
| Автоописание | graph: `routeAutoDoc`, `routeScreenGap`, покрытие autoDescribed/gaps, фильтр noScreens | route-auto-doc.test, api-docs-query.test |
| MCP | get_route: autoDoc/response/noScreens; describe_api: обе строки, noScreens; list_routes: autoSummary | server.test (korbor-all) |
| Вид «API» | блок «описание собрано из кода», причина в «Экраны», чип «Без экранов», покрытие «Описания из кода» | e2e api-docs-views |
| route-samples | экран вакансии рекрутера больше не берёт список кабинета клиента — связь была ложной | unit |
| Аудит остатка | grep клиентского кода по 76 «вызова нет»: 3 стора с fetchWithAuth-параметром и api.getRaw | тест падал; korbor 184 → 200 |
