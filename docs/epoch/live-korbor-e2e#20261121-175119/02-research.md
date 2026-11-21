# Research

## Как было

- Живые экраны открывались по прямому адресу приложения с query-токенами роли
  (`?lam_role=`), куки и sessionStorage не управлялись; iframe одного origin делили
  sessionStorage и уводили друг друга после входа.
- Бюджет iframe: live 8 / warm 8; невидимые экраны держали живой iframe.
- Раскладка — dagre по всей карте: на korbor-all ноды и группы наезжали, старт мелкий.
- scanner-react-router — регулярка по `path:` без вложенности; TanStack не понимал.
- Вида БД не было, хотя схема (scanner-source) уже в карте.

## Покрытие требований владельца

| Требование | Было | Сделано |
|---|---|---|
| Память, заморозка невидимых | live 8 + warm 8, iframe у всех видимых | live 6 + warm 2, остальные — снимки JPEG |
| Утечки | не мерились | 8 переключений карт — куча не растёт |
| Профили / вход один раз / вне git | нет | `.lam-sessions/` (600, gitignore), панель профилей |
| Через прокси | нет | шлюз :4320, ячейка на ноду |
| Роли recruiter / employer / admin | query-токен | профили с dev-входом, авто-обновление JWT |
| Значок «не авторизован» | нет | 401/403 из fetch/XHR страницы |
| Наложения | были | packLayout + тест на всех картах + e2e панелей |
| Страница целиком | нет | метка «обрезано», кнопка «целиком», окно с прокруткой |
| GPU / FPS | не мерилось | will-change вьюпорта, contain у нод, замер |

## Ключевые места

- Шлюз: `apps/visualizer-spa/src/lib/gateway/*`, подключение — `vite-plugin.ts`.
- Холст: `flow/AppMapCanvas.tsx`, `flow/canvas-layout.ts`, `flow/pack-layout.ts`, `flow/PageNode.tsx`.
- БД: `lib/db-view-model.ts`, `components/DatabaseView.tsx`.
- TanStack: `packages/scanner-react-router/src/tanstack.ts`, `source-text.ts`.
