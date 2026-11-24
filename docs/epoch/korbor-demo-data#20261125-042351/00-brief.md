# Brief — демо-данные korbor для карты экранов

## Цель

У экранов korbor (мини-апп под recruiter/employer, админка) есть данные для состояния «с данными» и реальные id в адресах экранов (vacancies/:id, chat/:candidateId, call/:callId, employer/vacancies/:id).

Задача пришла от лида (тиммейт «demo-data»), репозиторий — C:/work/korbor (main).

## Готово когда

- [x] `bun run --filter @korbor/db seed:lam-demo` — идемпотентный сид от пользователей seed:lam-users (tg 900000001 recruiter, 900000002 employer)
- [x] вакансии заказчика в разных статусах, отклики (applications), кандидаты, сделки, чаты с сообщениями, звонок, платежи и записи леджера, уведомления, отзывы
- [x] запись пакетная, без запросов в цикле; повтор не плодит строк
- [x] live-тест (TEST_DATABASE_URL) со своими tg id и уборкой — зелёный
- [x] прогон на dev-базе дважды без дублей
- [x] API под ролями отдаёт непустые списки; снимок визуализатора показывает данные
- [x] строка про seed:lam-demo в docs/agent-notes/memory/korbor-local-run.md (live-app-map)
- [x] коммит в korbor main

## Вне scope

- контракт packages/sdk/src/project.ts и состояния карты (зоны других тиммейтов)
- правки сервисов apps/api korbor
