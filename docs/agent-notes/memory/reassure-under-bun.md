---
name: reassure-under-bun
description: "Reassure в visualizer-spa под bun test — обёртка TEST_RUNNER_PATH, --conditions=require, имя замера вручную"
metadata:
  node_type: memory
  type: project
  originSessionId: 77745093-c8e7-4951-8def-3591e79d2936
  modified: 2026-11-22T05:27:01.561Z
---

Reassure 1.6 рассчитан на jest; в visualizer-spa он запускается под bun (2026-11-22, ветка crap-under-10):
- `bun run test:perf:baseline` / `bun run test:perf` в apps/visualizer-spa; CLI зовёт `node perf/bun-runner.mjs`, тот — `bun test --conditions=require` по *.perf-test.tsx.
- Без `--conditions=require` падает `plugins.ReactTestComponent`: ESM-обёртка pretty-format под bun отдаёт plugins undefined.
- `measureRenders` пишет файл через `expect.getState()` (нет в bun) — писать с `writeFile: false` и своей строкой (src/perf/perf-test.ts, perfTest).
- Сценарию передаётся результат render: `screen` не работает, брать `within(view.container)`. Фильтры живут в сторах — сбрасывать в `beforeEach` опций замера, иначе следующий прогон видит прошлый ввод.
- `fireEvent.change` не сужает список ApiView — вводить через userEvent.type.

**Why:** иначе снова уйдут шаги на те же грабли. **How to apply:** новые замеры — через perfTest из src/perf/perf-test.ts. Связано: [[spa-dom-tests-happy-dom]].
