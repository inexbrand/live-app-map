# Исследование

GitNexus по korbor не индексирован в этой сессии — поиск rg по коду korbor.

## Как устроено сейчас

- dev-база korbor: 2 пользователя (seed:lam-users), 1 компания, 0 вакансий/откликов/сделок/сообщений/уведомлений — все экраны пустые.
- `packages/db/scripts/seed-lam-users.ts` — образец: `seedLamUsers(db, list, now)`, upsert пакетами, live-тест `packages/db/src/__tests__/seed-lam-users.live.test.ts`.

## Как сервисы создают записи (инварианты)

| Сущность | Где в apps/api | Инвариант, который соблюдаем |
|---|---|---|
| Вакансия | `packages/domain/src/fsm/vacancy.ts` | draft → awaiting_payment → published → in_progress (первый take) → hired (`hire-repository.drizzle.ts markHired`: status hired, hire_deal_id, closed_at). Статус guarantee в коде никто не ставит — вакансия после найма остаётся hired. |
| Лента рекрутера | `routes/recruiter/vacancy-feed.ts`, `allowedVacancyLevels` | уровень 0 видит только junior; лента — published/in_progress |
| Оплата | `payments/handlers/payment-succeeded.ts` | ledger payment (credit, `ledger:payment:{invoiceId}`) + commission (credit, `ledger:commission:{invoiceId}`), intent → paid |
| Отклик | `modules/applications/take.ts`, `close-competing.ts` | applications UNIQUE(vacancy, recruiter); победитель → won/hire_win |
| Кандидат | `modules/candidates/submit.ts` | UNIQUE(vacancy, phone); recruiter_id = application.recruiter_id; закрепление candidate_locks (active, CANDIDATE_LOCK_MONTHS=12) |
| Сделка | `deals/hire-service.ts` | calcDealMoneySnapshot (комиссия 1800 bps, транши 3000/7000), guarantee_until = hired + guarantee_days, tranche1 due / tranche2 pending_guarantee; кандидат hired |
| Успех гарантии | `deals/guarantee-success.ts` | status completed, tranche2 due, guarantee_success_at |
| Выплата транша | `payouts/mark-tranche-paid.ts` | ledger tranche1/tranche2 debit, ключ `tranche{1,2}:{dealId}`, user = рекрутер |
| Кошелёк | `payouts/wallet-query-port.drizzle.ts` | строится из deals рекрутера (транши) |
| Чат | `chat_messages` | по candidate_id, sender_role employer/recruiter |
| Звонок | `modules/calls/service.ts` | рекрутер стартует kind=candidate; один живой на (candidate, kind); завершение endReason hangup |
| Уведомления | `packages/domain/src/notifications/registry.ts` | event_key строит buildNotificationEventKey, UNIQUE(event_key) |
| Отзывы | `reviews/*` | только по completed-сделке, UNIQUE(deal, from_user); users.rating_avg = ROUND(AVG,2), rating_count |

## Покрытие

Что нужно экранам и что сид даёт: лента (feed) — 3 junior в ленте; доска откликов — 2 активных + 2 выигранных; кандидаты всех стадий (submitted/interview/rejected/hired); чаты — 3 треда; звонок — 1 завершённый с расшифровкой и заметкой; кошелёк — 2 сделки (транш к выплате и выплаченные); вакансии заказчика — 8 во всех ветках (draft, awaiting_payment, published, in_progress, hired×2, cancelled); уведомления у обоих; отзывы и рейтинг.

Не покрыто сознательно: споры (disputes), замены (replacement_required), заявки на выплату, поддержка — отдельные состояния, не просили.
