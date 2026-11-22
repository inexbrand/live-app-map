# Проверка построчно

## Чеклист brief

- [x] MapToolbar — components/toolbar (ToolbarButton, ViewTabs, MapSelect, SourcesSheet, SettingsSheet, TlsProxyBlock, ThemeToggle, хуки); 674 → 110 строк; DOM шапки до/после совпадает.
- [x] MCP-хелпер — tool-kit, golden ответов MCP до/после; mutator 9/9.
- [x] Общие функции middleware — lib/dev-http (readBody, sendJson, requestPath, isLocalOrigin), тесты.
- [x] Один клиент API — lib/dev-api, тесты.
- [x] Фикстуры e2e — общие, voice.e2e стабилен (6 повторов, 12/12).
- [x] Пары dryer — 24 → 0 (порог 0.8).
- [x] Файлы > 300 строк из списка: app-store 34, MapToolbar 110, PageNode 300, scanner-next/index, pick-script, ApiView, viewport, export-appmap, scanner-core, route-input 72, schema/types, doc-graph, scanner-react-router — все ≤ 300.

## Цифры

| | до | после |
|---|---|---|
| dryer, пары ≥ 0.8 | 24 | 0 |
| crapper, функций | 1020 | 1162 |
| CRAP ≥ 10 | 367 | 387 |
| сумма CRAP | 72 626 | 58 602 |
| максимум CRAP | 11 130 | 7 482 |

Число функций с CRAP ≥ 10 выросло: большие непокрытые React-компоненты распались на мелкие, тоже без unit-покрытия (их проверяет e2e). Цель «все < 10» не достигнута — честно.

## Тесты: реальные вызовы?

Да: store-logic на карте korbor-miniapp и через useAppStore; dev-http на настоящем IncomingMessage; golden сканеров на korbor.

- typecheck: 16 пакетов + visualizer-spa — 0 ошибок.
- unit: 732 pass, 0 fail (115 файлов).
- e2e: 35/35 (dev на :4316).
- mutator: tool-kit 9/9, ui 63/65, dev-api+http 46/55, store/app 89/106; выжившие — эквивалентные (07).

## Баги

См. 09-bugs.md — открытых нет.
