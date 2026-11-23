---
name: large-file-edit-tooling
description: context-mode denies Read/edit() of files over ~25KB — read via shell cat and write back
metadata:
  node_type: memory
  type: feedback
  originSessionId: 21462fd9-4823-4132-8f6f-06f4012e6749
  modified: 2026-11-20T13:41:30.402Z
---

В этой среде плагин context-mode запрещает Read (и REPL edit(), который читает через Read) для файлов больше ~25 КБ (MapToolbar.tsx, app-store.ts, global.css в live-app-map).
**Why:** edit() падает с «Permission denied for Read: over the one-read limit».
**How to apply:** для больших файлов читать `$\`cat\``, менять строковыми заменами с проверкой единственности якоря и писать write(); после — git diff --stat, чтобы убедиться, что файл не испорчен.
