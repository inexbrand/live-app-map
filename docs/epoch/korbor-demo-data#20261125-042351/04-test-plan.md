# План тестов

## Unit / live

- вызываем реальный `seedLamDemo(db, parties, now)` на живом Postgres (TEST_DATABASE_URL), пользователи — через реальный `seedLamUsers` со своими tg id.
- ничего не мокаем.
- проверки: статусы вакансий по веткам FSM; деньги сделки = формула domain (calcCommissionTiyin/calcTrancheParts); у каждой оплаченной вакансии ledger payment+commission; кандидаты hired ↔ сделка; у треда есть сообщения; уведомления у обоих; отзывы только по completed-сделке, рейтинг пересчитан; повторный запуск — те же количества строк.
- уборка: удаление всех строк тестовой пары.

## Реальные вызовы

- dev-база: сид дважды, сравнение количеств.
- API под ролями через автовход (/api/lam-dev-auth) — /api/v1/recruiter/vacancies (лента), /applications, /wallet, /employer/vacancies, админские списки.
- снимок визуализатора /__lam_snapshot для /feed, /employer/vacancies.
