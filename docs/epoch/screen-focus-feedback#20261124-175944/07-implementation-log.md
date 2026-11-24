# Что сделано

## Изменения (по коммитам)

- `df983c8` — SSE `GET /api/comments/stream` (lib/comments-stream.ts): один fs.watch на папку, 120 мс склейка, ready/changed, ping 25 с; EventSource в useCommentsSync вместо опроса.
- `5495790` — этап ветки `stage` (waiting / review / done) в свёртке событий (mcp-server comments-schema), фильтр `stage` у list_comments.
- `07bc29a` — вариант Б3 в коде:
  - клик по экрану → камера по центру (focusCamera), остальные гаснут (page-node--dim), связи скрыты (flow-host--focus);
  - плашка FocusBar под экраном: соседи [ ], роль, «Выбор компонента C / Приложение I», «К экрану W», «N открыто», вкладка;
  - выбранный экран сразу в режиме выбора (useCommentPicker, повтор pick каждые 2 с — сообщение до подключения сокета теряется);
  - окно у компонента CommentPopover (история, «Принять / Не исправлено», поле + голос), едет за камерой rAF-ом, ушло из кадра — закрывается, текст — черновик в localStorage;
  - снимок компонента — вырезка из кадра трансляции (canvasShot), без getDisplayMedia;
  - лист CommentsSheet (⇧C, кнопка шапки со счётчиком «проверьте»): черновики, проверьте, ждут агента, исправлено; фильтр, поиск, J/K/Enter/A/N/Esc;
  - удалены ScreenCommentsPanel, CommentsListPanel, CommentComposer, CommentThreadItem, CommentStatusBadge, панель экрана справа.
- `19db880` + `add404a` (автосейв) — тесты под новый интерфейс: comments, voice, snapshot, canvas, use-comments.
- fix плашки: `?? []` в селекторе zustand → бесконечная перерисовка («Визуализатор упал» при клике по экрану сайта); NO_STATES; focus-bar.test; справка клавиш.
- `ebab962` — по живой проверке: клик выбора не уходит в страницу (ScreenView: up только после своего down), MAX_ZOOM 1.5 — общий потолок фокуса и React Flow, лист закрывает окно, подпись «Все экраны» в фильтре.

## Команды проверки

- `bunx tsc --noEmit -p tsconfig.json` (apps/visualizer-spa) — 0 ошибок.
- `bun test ./src/components ./src/lib/comments ./src/store ./src/flow` — 380 pass / 0 fail.
- `bun --bun vite build` — собирается.
- Живая проверка: `bun --bun vite --port 4399` с LAM_FEEDBACK_DIR в scratchpad, Helium (helium-agent), карта «Сайт» (:16001).

## Не сделано

- Панель кода экрана (вызовы API, переход к роуту), живой URL, «Копировать URL», лог экрана — были в правой панели экрана, вместе с ней убраны. В фокус-режим не перенесены.
- Живой путь «агент ответил → Принять / Не исправлено» не прогонялся в браузере (нужен ответ агента через MCP); покрыт DOM-тестами comments.test.
