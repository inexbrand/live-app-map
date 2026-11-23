# Test plan

| Пункт | DOM-тест | e2e |
|---|---|---|
| 1 | panel-close.test.tsx (крестик, Esc, виды, Esc при диалоге) | ui-audit-fixes «панель экрана…» |
| 2, 9 | canvas.test.tsx (карточка, рёбра), page-node/parts.test.tsx | «карточка в покое…» |
| 6 | canvas.test.tsx (класс обзора и --lam-zoom) | «обзор при отдалении…» (подпись ≥ 12 px, над рамкой) |
| 4 | MapToolbar.test (настройки, «Входы»), SessionProfilesPanel.test (форма по кнопке) | — |
| 5 | MapToolbar.test (нет «Источников», крошка-дубль) | «на 768 px шапка…» по всем видам |
| 7 | load-error.test, MapToolbar.test, pin-load.test | «карты нет по адресу…» |
| 8 | ApiView.test (покрытие, значки, путь группы), ApiRouteCard.test | «API» |
| 10 | DocsView.audit.test, DocsView.states.test | «документация», docs-bugs, api-docs-views |
| 3 | DocGraphView.test | «граф документации», ux-flows |
| 26/4 | DocsView.audit.test (снимок, ошибка, граф) | «числа документации» |
