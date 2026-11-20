# Журнал

1. Схема: ApiCall, ScreenApi, ребро api, codeFileOfNode → schema. Тесты схемы.
2. Фикстура фронтендов (web: fetch/axios/ky/обёртки/билдер; miniapp: Eden, Hono RPC, .env.development) и тест сканера — сначала красный.
3. env-files, api-value + value-evaluator, api-sinks, api-calls, api-match, screen-calls. Ошибки по пути: склейка `base + '/' + path` давала `//orders` и срезалась как protocol-relative; динамический аргумент засчитывался месту вызова — теперь только литерал с `/`.
4. korbor: 41 вызов → эвристика именованного клиента → 288; vpn-saas 212.
5. Фабрики роутов (route-factories): korbor 234 → 270 сопоставленных.
6. CLI: entries, рёбра api, сводка. Коммит ef17a37.
7. Экраны RR (rr-screens): сначала все экраны miniapp указывали на конфиг; пути `[id]`; перебор через фабрики клиентов (32 вызова у /register) → фабрики не обходятся, метод по имени в своём сервисе.
8. SPA: панель экрана, «К роуту», вызывающие экраны у роута, рёбра пунктиром; viewer-формат хранит root и source.
9. Playwright на :4310, коммит, PR.
