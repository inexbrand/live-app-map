# Журнал

| Шаг | Что и зачем | Коммит |
|---|---|---|
| korbor | `dev.ts --without=bot,call`: бот без токена падал и мешал запуску | korbor d06ccdac |
| shadcn | init Base UI/nova, Tailwind v4, токены тем в `index.css`, класс `.dark` | c319448 |
| Шапка, настройки, панель экрана | поиск по центру, тема в настройках, крошки и «Логи и статус» убраны, `ScreenStatusLog` | 224ca16 (авто-сохранение хука) |
| Вид «API» | `apiDomains`, домены, доска роута, шапка на flex, `@layer base` | 7d123fd |
| Весь SPA на shadcn | кодмод Button/Chip/Badge/Input, ручной перевод Select/Field/Panel/EmptyView, `src/ui` удалён | a60b18e |
| vite :4310 | перезапущен дважды: (1) старый процесс без алиаса `@`; (2) две копии `app-store.ts` (`?t=`) после чужой горячей правки стора — шапка и вид смотрели в разные сторы | — |
| korbor :16000 | API завершился с кодом 9 в 13:05; korbor перезапущен целиком (`--without=bot`), api/site/admin/miniapp — 200 | — |
| Автовход | `POST /__lam_sessions/auto` с origin 5175/16002/16001: recruiter, employer, admin — fresh; у сайта :16001 dev-входа нет | — |
