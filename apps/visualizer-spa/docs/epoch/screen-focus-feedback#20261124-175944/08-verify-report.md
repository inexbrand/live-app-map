# Проверка

- bun test comments-middleware.test.ts, use-comments.test.tsx, components/comments — 3/3, 4/4, 20/20.
- bun run typecheck (spa + e2e) — exit 0.
- Живой dev :4399, LAM_FEEDBACK_DIR в scratchpad: curl -N /api/comments/stream → `ready`, `changed` после POST, `changed` после файла-события «агента»; GET → status fixed.
- В общем прогоне с canvas.test падает чужой таймер AppMapCanvas.tsx:207 (window is not defined) — см. 09-bugs.
