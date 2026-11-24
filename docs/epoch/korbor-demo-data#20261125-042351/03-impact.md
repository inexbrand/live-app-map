# Влияние

| Символ | Файл | Почему заденет |
|---|---|---|
| seedLamDemo (новый) | korbor packages/db/scripts/seed-lam-demo.ts | новый скрипт, продуктовый код не меняется |
| scripts seed:lam-demo | korbor packages/db/package.json | новая команда |

## Риски

- Уведомления status=pending забрал бы воркер outbox и попытался слать в Telegram на фиктивные tg id → пишем status=delivered.
- Повторный запуск: стабильные id (хеш от пары пользователей и ключа сущности) + ON CONFLICT DO NOTHING.
- deals.number — identity; повтор не вставляет новую строку, номер не растёт.
- Циклическая связь vacancies.hire_deal_id ↔ deals.vacancy_id: вставка вакансии без hire_deal_id, потом сделка, потом UPDATE пакетом — всё в одной транзакции.
