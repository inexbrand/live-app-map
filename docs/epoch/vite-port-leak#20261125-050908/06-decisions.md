# 06 — Решения

- strictPort в vite.config, а не флаг в package.json: покрывает и `bun run dev`, и программный createServer (тест, e2e), и preview.
- Плагины шлюза и трансляции не трогал: замер показал, что они порты не копят.
