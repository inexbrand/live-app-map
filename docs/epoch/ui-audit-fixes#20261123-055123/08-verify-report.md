# Verify report

Ветка Resterr1337/ui-audit-fixes, 2026-11-23.

| Проверка | Итог |
|---|---|
| typecheck (tsc app + e2e) | 0 ошибок |
| unit, `bun test src` (apps/visualizer-spa) | 740 pass / 0 fail |
| e2e, весь набор Playwright (dev-сервер 4314, шлюз 4324) | 44 passed / 0 failed |
| crapper по 46 изменённым файлам | максимум 9.0 (EpochHead, FlowCanvas, PageNodeInner), все < 10 |
| dryer, порог 0.8 | дублей нет |
| lint | в проекте нет eslint/biome; изменённые строки проверены регэкспами антипаттернов пользователя (надзаголовки, 01/02, шрифты, зашитые запасные, as const, any, ts-ignore) — 0 |

## Скриншоты

- До: [shots/before](shots/before) — 39 кадров аудита.
- После: [shots/after](shots/after) — 25 кадров с теми же именами для пар до/после
  (screens-default, screens-fit, node-panel, sheet-settings, sessions, api-view, docs-clean,
  docs-bugs-tab, docs-graph, docs-not-ready, error-bad-map, narrow1024-*, narrow768-*, light-*),
  плюс новые: sheet-settings-dev, sessions-form, api-coverage-open, after-canvas-rest/selected/overview,
  after-header-768, after-load-error, after-api, after-docs, after-docs-snapshot-note, after-docs-graph.

## По пунктам

1. Панель экрана: крестик, Esc, только на «Экранах» — panel-close.test 4/4, e2e «панель экрана».
2. Карточка в покое — название и путь; кнопки под мышью и у выбранной; размер у выбранной — canvas.test, e2e.
3. Граф документации: 59 узлов по умолчанию (было 544), «показать все» > 200 — DocGraphView.test, e2e.
4. Настройки простым языком, «Для разработчика» свёрнуто, лист «Входы», форма по кнопке — MapToolbar.test, SessionProfilesPanel.test.
5. Шапка: «Источников» нет, крошка-дубль скрыта, на 768 px не шире окна на всех видах — e2e.
6. Обзор при зуме < 0.4: подписи экранов ≥ 12 px на экране, подпись раздела над рамкой — canvas.test, e2e.
7. Ошибки загрузки по-человечески, только баннер — load-error.test, e2e.
8. API: покрытие свёрнуто в одну строку, значки только у отличий, без пути группы и курсива — ApiView.test, ApiRouteCard.test, e2e.
9. Подписи рёбер только у выбранного экрана, без live/warm — canvas.test, e2e.
10. Документация без повторов, `~~` зачёркнуто, чип «Не готово 0» скрыт в списке и графе — DocsView.audit.test, DocGraphView.test, e2e.

Числа 26/4 против 29/0 — снимок карты против диска korbor (см. 02-research); строка
«Показан снимок из карты…» — DocsView.audit.test, e2e «числа документации».
