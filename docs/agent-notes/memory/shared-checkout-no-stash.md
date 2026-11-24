---
name: shared-checkout-no-stash
description: "В checkout live-app-map параллельно работают другие агенты — не делать git stash, коммитить только свои пути"
metadata:
  node_type: memory
  type: feedback
  originSessionId: e2489bbf-8c71-439f-b4e7-5531df1a1f07
  modified: 2026-11-24T23:51:01.743Z
---

В `C:\work\live-app-map` одновременно работают несколько агентов в одном checkout (2026-11-23: shadcn-агент закоммитил
чужую незакоммиченную правку кэша live URL в свой `c319448`, видимо `git add -A`).

**Why:** `git stash` прячет и чужие файлы; чужой `add -A` забирает твои правки в чужой коммит.
**How to apply:** проверку «было ли падение до меня» делать через `git worktree`/`git show HEAD:file`, не stash;
коммитить `git add <свои пути>` и сразу. См. [[worktree-git-and-korbor-scan]].

Ещё: `git add <мои пути>` не спасает — коммит берёт весь индекс, а другая сессия могла уже проиндексировать свои удаления (`git rm`). 2026-11-24 так в 148bb82 ушли чужие удаления, master был не собран до её коммита. **Перед каждым commit смотреть `git diff --cached --name-only`**; чужое в индексе — коммитить через `git commit -- <мои пути>` (only), не голым commit.

Обратное тоже: свой `git rm` (индекс) соседний auto-save/commit заберёт в свой коммит — 2026-11-25 удаление карт korbor ушло в чужой f948410. Удаления делать и коммитить одним шагом: `git rm … && git commit -- <пути>`.
