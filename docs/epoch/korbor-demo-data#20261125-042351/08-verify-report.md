# Проверка

## Чеклист brief

- [x] seed:lam-demo — команда есть, идемпотентна (dev ×2: v8 a4 c6 d2 m8 calls1 l12 n30 r2 pi5 locks6 до и после).
- [x] вакансии во всех ветках: draft, awaiting_payment, published, in_progress ×2, hired ×2, cancelled.
- [x] пакетная запись, по одному insert на таблицу в транзакции, без запросов в цикле.
- [x] live-тест 4/4 (с seed-lam-users 6/6), уборка — пользователей в базе снова 2.
- [x] API под ролями (вход через /api/lam-dev-auth, initData → /api/v1/auth/telegram/miniapp):
  recruiter: /recruiter/vacancies 3, /recruiter/applications 4, /recruiter/candidates 6, /recruiter/wallet 4, /recruiter/chat/threads 6, /me/notifications 11;
  employer: /employer/vacancies 8, /employer/chat/threads 6, /me/notifications 19;
  admin: /admin/vacancies 8, /admin/deals 2, /admin/ledger 12, /admin/candidates 6, /admin/calls 1 — все 200.
- [x] снимки визуализатора (/__lam_snapshot, 390×844, refresh=1): recruiter /feed — 3 карточки вакансий; /wallet — «Ожидается 442 800 UZS, выплачено 1 804 000 UZS», 4 транша; /chats — 6 тредов, непрочитанное у «Продавец-консультант»; employer /employer/vacancies — сводка «Кандидаты 6, открытых 5 из 8», карточки по статусам.
- [x] строка в памяти korbor-local-run.md.
- [x] коммит korbor 487bb87.

## Тесты: реальные вызовы?

Да: тест вызывает seedLamUsers и seedLamDemo на живом Postgres, сверяет деньги с функциями домена, ничего не мокает.

## Баги

См. 09-bugs.md
