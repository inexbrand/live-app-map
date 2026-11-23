# `@live-app-map/dev-auth`

Автовход для живой карты: приложение отдаёт роли и выдаёт их сессии, визуализатор при загрузке карты сам заводит профили входа. Человеку не нужно логиниться, чтобы посмотреть экран под ролью.

## Протокол (версия 1)

Маршруты лежат под `/api/lam-dev-auth`: dev-серверы фронтендов проксируют `/api` на бэкенд, поэтому визуализатор находит вход через origin любого экрана карты.

| Запрос | Ответ |
|--------|-------|
| `GET /api/lam-dev-auth/roles` | `{ protocol: 1, roles: [{ id, label, origin }] }` |
| `POST /api/lam-dev-auth/session` `{ role }` | `{ protocol: 1, role, session: { storage?, cookies?, expiresAt, actor? } }` |

- `origin` роли — фронтенд, куда кладётся сессия; `storage` — ключи sessionStorage, `cookies` — заголовки Set-Cookie, как их выдал бы обычный вход.
- Ошибка — `{ error, hint?, field? }`: 400 (нет role), 403 (не с этой машины и без секрета), 404 (нет роли), 502 (функция выдачи упала — текст её ошибки).

## Подключение в приложении

```ts
import { createDevAuthHandler } from '@live-app-map/dev-auth';

const devAuth = createDevAuthHandler({
  environment: process.env.NODE_ENV ?? '', // пусто — ошибка; production — маршрутов нет
  secret: process.env.LAM_DEV_AUTH_SECRET, // нужен только для запросов не с этой машины
  roles: () => [
    { id: 'admin', label: 'Админ', origin: 'http://localhost:16002', issue: () => myLogin.issueFor('admin') },
  ],
});

Bun.serve({ fetch: async (req, server) => (await devAuth(req, server.requestIP(req)?.address ?? '')) ?? app.fetch(req) });
```

`issue` обязан выдавать сессию обычными функциями входа приложения, а не обходить их.

## Сторона визуализатора

`fetchDevAuthRoles`, `issueDevAuthSession`, `isDevAuthExpired` — клиент протокола; шлюз визуализатора (`apps/visualizer-spa/src/lib/gateway/dev-auth-sync.ts`) зовёт их при загрузке карты и перед загрузкой страницы с истёкшей сессией.

## Verify

```bash
bun test packages/dev-auth
```
