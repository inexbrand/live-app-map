# 05 — Шаги

1. Этап А: этот разбор → коммит.
2. `fix(visualizer)`: восстановить 9 отсутствующих модулей, починить экспорт типов и `convert.ts` → `bun run dev` стартует.
3. schema v2: типы `CodeModel` (сервисы, символы, роуты, вызовы БД, таблицы), Zod, `upgradeAppMapDocument`, `NodeKind 'service'`, конверт viewer ↔ enterprise. Тесты.
4. `packages/scanner-source`: фикстура → тест (красный) → сканер на TS compiler API.
5. CLI: `scan --code-dir`, команда `code`. Тесты.
6. Визуализатор: `ServiceNode` на холсте, `CodePanel` в правой панели. Тест + Reassure-замер, если встанет.
7. Проверка на korbor и vpn-saas, примеры карт в `maps/`, отчёт 08, PR.
