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

## Вкладка «Компоненты» живьём

Визуализатор из рабочей копии на :4421 с LAM_PROJECT=packages/sdk/test/fixture (временный config.ts: app fx, dir src, baseUrl http://127.0.0.1:5431),
фикстура SDK на Vite :5431 с lamVite. Headless Helium: вкладка «Компоненты» → 2 узла (Card/red, Remote/empty), у обоих холст трансляции;
кадры: карточка «Из варианта» в красной рамке (props + styles), Remote — «200 []» (api варианта). Ошибок страницы нет. Снимок: proof/gallery-live.png.
Тесты: components-view, components-store, components-gallery, stream-sync — 16 pass; tsc visualizer-spa чисто. Серверы 4421/5431 остановлены, временный config.ts удалён.

## Вкладка «Компоненты» на korbor (общий :4310, --project ../korbor)

Headless Helium: 2 группы (Мини-приложение · src/components/ui, · src/shared/ui), 26 узлов (7 компонентов states.ts), 12 с живой трансляцией;
кадры — настоящие компоненты: Button ×6, Badge ×4, UnreadBadge, WebActionButton «Отказать»/«Запросить выплату», SkeletonList. Остальные 14 — подпись
«Экран оживёт…» (предел 12 живых). Раскладка переделана: строка на компонент, варианты слева направо (первая — две высокие колонки, fitView делал узлы нечитаемыми);
пока грузится — подпись вместо пустого холста (ловил пустой холст на первой загрузке). Снимок: proof/gallery-korbor.png.
