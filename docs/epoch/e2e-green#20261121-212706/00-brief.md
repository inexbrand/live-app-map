# Brief

Задача координатора (Orca, task_7758208bce5d): на master ef13104 полный `bunx playwright test` в apps/visualizer-spa — 17 passed, 4 failed.

- overlap.e2e «нет наложений панелей 1024×700» — тулбар не помещается на узком экране.
- smoke.e2e «toolbar: no brand/live, map select works, FHD viewport», «load site map has many pages (>10)»; import-clear.e2e — падали до PR #5.

Готово когда: 0 упавших два прогона подряд, typecheck чистый, скриншоты сценариев, PR слит в master.
Вне рамок: отключать тесты, мокать хелперы.
