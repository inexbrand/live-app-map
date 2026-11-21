# Найденные баги

## Open

## Closed

- Мини-карта обрезана, клик не работал, korbor-all — полоса (12cdd37).
- Колесо над экраном не прокручивало страницу (1171eee).
- vacancies/:id «Не найдено» (256f5c1).
- e2e/smoke.e2e.ts «toolbar … FHD viewport» ждал ноду экрана первой — исправлено в эпохе e2e-green; полный e2e 31/31.
- e2e/smoke.e2e.ts «site map has many pages» и import-clear.e2e считали ноды при onlyRenderVisibleElements — исправлено в e2e-green (счёт по мини-карте и каталогу).
- Раскладка korbor-all: группа админки столбцом 3940×26736 — теперь 6972×5324, ширина ряда по площади, кусок «меню → экраны» полками (0abe2c7, pack-layout.test, screens/korbor-all-layout.png эпохи close-open-bugs).
- Экраны без списка для параметра (chat/[candidateId], call/[callId], legal/[code], register/[step] …) — не чиним, обосновано (06-decisions эпохи close-open-bugs): у их API нет списка той же сущности, подставить реальный id не из чего; пример из скана — честная заглушка, не ошибка. Нужен источник примеров на экран (настройка профиля) — отдельная задача.
