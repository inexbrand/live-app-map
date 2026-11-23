---
name: shared-checkout-no-stash
description: "В checkout live-app-map параллельно работают другие агенты — не делать git stash, коммитить только свои пути"
metadata:
  node_type: memory
  type: feedback
  originSessionId: e2489bbf-8c71-439f-b4e7-5531df1a1f07
  modified: 2026-11-23T12:35:37.976Z
---

В `C:\work\live-app-map` одновременно работают несколько агентов в одном checkout (2026-11-23: shadcn-агент закоммитил
чужую незакоммиченную правку кэша live URL в свой `c319448`, видимо `git add -A`).

**Why:** `git stash` прячет и чужие файлы; чужой `add -A` забирает твои правки в чужой коммит.
**How to apply:** проверку «было ли падение до меня» делать через `git worktree`/`git show HEAD:file`, не stash;
коммитить `git add <свои пути>` и сразу. См. [[worktree-git-and-korbor-scan]].
