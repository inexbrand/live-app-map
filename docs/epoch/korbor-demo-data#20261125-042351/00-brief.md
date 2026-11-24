# Brief — демо-данные korbor для карты экранов

## Цель

У экранов korbor (мини-апп под recruiter/employer, админка) есть данные для состояния «с данными» и реальные id в адресах экранов (vacancies/:id, chat/:candidateId, call/:callId, employer/vacancies/:id).

Задача пришла от лида (тиммейт «demo-data»), репозиторий — C:/work/korbor (main).

## Готово когда

- [ ] `bun run --filter @korbor/db seed:lam-demo` — идемпотентный сид от пользователей seed:lam-users (tg 900000001 recruiter, 900000002 employer)
- [ ] вакансии заказчика в разных статусах, отклики (applications), кандидаты, сделки, чаты с сообщениями, звонок, платежи и записи леджера, уведомления, отзывы
- [ ] запись пакетная, без запросов в цикле; повтор не плодит строк
- [ ] live-тест (TEST_DATABASE_URL) со своими tg id и уборкой — зелёный
- [ ] прогон на dev-базе дважды без дублей
- [ ] API под ролями отдаёт непустые списки; снимок визуализатора показывает данные
- [ ] строка про seed:lam-demo в docs/agent-notes/memory/korbor-local-run.md (live-app-map)
- [ ] коммит в korbor main

## Вне scope

- контракт packages/sdk/src/project.ts и состояния карты (зоны других тиммейтов)
- правки сервисов apps/api korbor
