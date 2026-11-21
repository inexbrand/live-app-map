# Влияние

- `store/view-store.ts` — центр: адрес страницы (query) ↔ состояние вида. Затрагивает все виды и `use-map-nav`. Риск: петля pushState ↔ popstate; решение — один писатель (подписка store → history), popstate применяет состояние без записи.
- `App.tsx` читает `?map=&baseUrl=&role=` — новые параметры (`view`, `route`, `table`, `doc`, `screen`) не должны ломать старые deep-link и e2e (`openMap` грузит `/?map=…`).
- `MapToolbar.tsx` (большой файл, читать через cat): крошки, поиск, тема. e2e ищут `[role=group][aria-label="Вид"]`, `view-api`, `view-docs` — сохранить.
- Граф документации — новый модуль; данные из `DocsModel` и `resolveDocRef` (только чтение пакета graph; логика сканера не трогается).
- Новая зависимость `d3-force` (раскладка графа). Рисование — свой canvas.
- CSS: замена зашитых цветов токенами меняет вид нод холста; e2e на холст (minimap, overlap, node-scroll) проверяют геометрию, не цвета.
- Параллельно задача 11 правит ApiView и сканер — в ApiView минимум правок, конфликты решать rebase --autostash.
