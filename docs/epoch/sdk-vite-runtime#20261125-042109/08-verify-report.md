# Проверка

## Тесты

`bun test packages/sdk/test` — runtime.test.ts 12 pass, vite.test.ts 12 pass (реальный createServer Vite 6 + headless Helium):
пустое/ошибка/pending/delayMs/sessionStorage, /@lam/state 200 и 404 с подсказкой, дерево компонентов (имя, файл, usedAt, рамка 200×80),
страница компонента (props, обёртка, стиль border rgb(255,0,0)), api варианта, 404 варианта, vite build без `__LAM__`/`lam_state`/`/@lam/`.
`tsc --noEmit` sdk и visualizer-spa — чисто. Пикер: pick-script.test + picker.test — 12 pass.

## Живой korbor (Vite 8.1.5, miniapp, роль recruiter через /api/lam-dev-auth/session)

| lam_state | запросов /recruiter/vacancies в сеть | экран |
|---|---|---|
| нет | 2 (200) | живые вакансии Dogfood Company |
| miniapp:route:/feed/empty | 0 | «Пока нет подходящих вакансий» |
| miniapp:route:/feed/error | 0 | «Что-то пошло не так. Внутренняя ошибка…» |
| miniapp:route:/feed/loading | 0 | «Загрузка…» |

/@lam/component?key=apps/miniapp/src/shared/ui/WebActionButton.tsx#WebActionButton&variant=primary — кнопка «Откликнуться (вариант lam)» в AppProviders со стилями, ошибок страницы нет; `__LAM__.components()` дал дерево AppProviders → … → WebActionButton (src/shared/ui/WebActionButton.tsx).
Снимки: proof/*.png.
