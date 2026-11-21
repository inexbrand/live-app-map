# Найденные баги

## Open

- (пусто по задаче)

## Вне задачи (были до неё, воспроизводятся и на сервере PR #4 :4310)

- e2e/smoke.e2e.ts «toolbar … FHD viewport»: первая .react-flow__node теперь рамка группы («Экраны20»), тест ждёт ноду экрана.
- e2e/smoke.e2e.ts «site map has many pages (>10)» и e2e/import-clear.e2e.ts: считают .react-flow__node при onlyRenderVisibleElements — в кадре 2–7 нод.
- Раскладка korbor-all: группа админки 4176×21902 px (столбец) — мини-карта поэтому узкая (56×180), но без пустого фона.
- Экраны без списка для параметра (13 из 31 в korbor-all: chat/[candidateId], call/[callId], legal/[code], register/[step], jobs, payments, reviews …) остаются с примером из скана: у их API нет списка той же сущности.

## Closed

- Мини-карта обрезана, клик не работал, korbor-all — полоса (12cdd37).
- Колесо над экраном не прокручивало страницу (1171eee).
- vacancies/:id «Не найдено» (256f5c1).
