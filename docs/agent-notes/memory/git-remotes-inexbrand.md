---
name: git-remotes-inexbrand
description: "Канонический origin live-app-map и korbor — организация inexbrand на GitHub, форк Resterr1337 — remote user"
metadata:
  node_type: memory
  type: project
  originSessionId: ea472205-5ab5-4dc3-bba8-1ce13b325889
  modified: 2026-11-23T12:10:18.554Z
---

Главные репозитории — `inexbrand/live-app-map` и `inexbrand/korbor`: это `origin`. Форки `Resterr1337/*` подключены как remote `user`. На 2026-11-23 у копии live-app-map на Windows (C:\work\live-app-map) origin смотрел на форк, и `git pull` ничего не приносил: копия отстала на 272 коммита. Remotes перенастроили, master подтянут к origin/master. Старый локальный коммит с chii/chobitsu (4e5459d) сохранён в ветке `backup/master-before-inexbrand-20261123` и в inexbrand не влит.

**Why:** пользователь ждёт, что «последнее обновление» — это inexbrand, а не форк.

**How to apply:** перед `git pull` смотреть `git remote -v`: origin должен указывать на inexbrand. Связано: [[korbor-local-run]].
