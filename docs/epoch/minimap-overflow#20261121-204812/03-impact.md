# Влияние на остальной код

## Зависимый код

| Символ | Файл | Почему заденет |
|---|---|---|
| MiniMap / CSS мини-карты | AppMapCanvas.tsx, global.css | overlap.e2e проверяет, что мини-карта не наезжает на кнопку журнала — размер меняется |
| inject-script | lib/gateway/inject-script.ts | новый тип сообщения wheel; тест inject-script |
| PageNode | flow/PageNode.tsx | обработчик колеса; область PR #4 (снимки под iframe) — не трогаю |
| resolveLiveUrl | store/app-store.ts | подстановка реальных параметров маршрута |

## Риски

- PR #4 правит те же файлы (PageNode, app-store, global.css) — конфликты при rebase; правки делаю точечно.
- Колесо над нодой больше не зумит холст, если страница прокручивается — Ctrl/⌘+колесо и колесо вне нод зумят.
