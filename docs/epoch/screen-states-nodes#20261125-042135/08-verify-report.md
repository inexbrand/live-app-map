# Проверка

## Тесты (реальные функции)
- bun test packages/schema — 53 pass (page-state.test.ts: контракт, старые name/inject, ошибки).
- bun test (визуализатор, затронутое): state-nodes, project-states, state-nodes-store, live-url, pack-layout, canvas-layout, src/lib/stream (вкл. stream-service.steps.test.ts на headless Helium), snapshot-service(.steps), MapToolbar — 153 pass, 0 fail.
- Раскладка korbor-all + 90 узлов-состояний (по 3 у каждого 3-го экрана): 6972×11992 → 10468×16012, наложений нет; состояние в ряду своего экрана.
- tsc визуализатора: мои файлы чисто; единственная ошибка — src/lib/build-map-catalog-fs.test.ts(49) (зона project, не моя).
- Прогон src визуализатора целиком: 783 pass, 4 fail — panel-close.test.tsx (панели экрана нет с 07bc29a, Б3) и шлюз «вход: кука» — не от этих правок.

## Живая проверка (свой vite :4431, LAM_PROJECT = копия korbor/.live-app-map + states.ts с 3 состояниями /feed, headless Helium)
- GET /__lam_project/states → 200 { screens }.
- Узлы «feed · Открыты фильтры», «feed · Пустая лента», «feed · Неверный шаг» в ряду экрана feed, значок вида (data-lam-state-kind=ui).
- Адрес узла: `http://recruiter--s5175-vite--1hqyjrw.localhost:4450/?lam_role=recruiter&lam_state=miniapp%3Aroute%3A%2Ffeed%2Ffilters-open#/feed` — профиль recruiter, lam_state.
- Шаги click [data-testid=open-filters] + waitFor role=dialog: кадр узла — открытый лист «Фильтры» (shots/state-filters-open.png).
- Неверный шаг: подпись поверх экрана «шаг 1 не выполнен: клик #net-takogo — элемент не найден за 5 с» (shots/state-broken-step2.png; на снимке — ложный текст «page closed», исправлен 835b7bb).
- Переключатель «Состояния» выключен → узлов-состояний 0, группа «Мини-приложение» 23 → 20 (shots/map-with-states.png, map-without-states.png).
- «Пустая лента» показывает данные: в korbor ещё нет плагина lamVite (рантайм sdk) — подмена API по lam_state не проверена.
