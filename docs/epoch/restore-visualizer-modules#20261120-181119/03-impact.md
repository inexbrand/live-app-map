# Impact

- `@live-app-map/schema` — используется всеми пакетами; правка convert только добавляет высоту viewport.
- `@live-app-map/mcp-server` — разбивка server.ts на модули; stdio-поведение то же, плюс новые tools.
- visualizer-spa: App/MapToolbar/PageNode/FeedbackPanel/vite.config — подключение модулей.
- Не трогаю `packages/scanner-*` и `scanner-source`.
- Риск: Screen Capture API требует разрешения пользователя; в headless — флаг Chromium.
