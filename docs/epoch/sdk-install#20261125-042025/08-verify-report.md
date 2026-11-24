# Проверка

- `bun test packages/cli/src/init.test.ts` — 14 pass (настоящая ФС во временных папках; настоящий `bun add -d` локального tgz и tgz по URL с Bun.serve; повтор не переставляет).
- `bun test packages/sdk/scripts/pack.test.ts` — 4 pass (настоящий tarball: dist/index.js, index.d.ts, без src).
- `tsc --noEmit` по init.ts/commands.ts: ошибок в моих файлах нет. В packages/cli есть чужая ошибка src/project/payload.ts(154,68) (зона project, в работе).
- `bun run --cwd packages/sdk pack:tarball` на текущем master — tarball с dist/index.js, vite.js, runtime/index.js и d.ts, exports на dist, peer vite >=6.
- install.sh дважды на временном проекте (apps/web порт 5173, apps/admin порт из env), LAM_HOME — клон, LAM_SDK_TARBALL — tarball: EXIT 0; config.ts (admin baseUrl пустой с подсказкой, web http://localhost:5173), states.ts, скилл, .gitignore с одной строкой map.json; повтор — «уже есть, не тронут».
- tsc по .live-app-map/config.ts и states.ts проекта с установленным tarball — 0 ошибок.
- Живая проверка tarball: проект с vite 6 под node, lamVite() из установленного tarball, headless Helium: без lam_state #root пуст (API 404), с `?lam_state=demo3:route:/ /empty` — `{"items":[]}` (подмена работает). Сервер остановлен.
- actionlint (docker rhysd/actionlint, файл через stdin) — 0 замечаний; контрольный файл с ошибкой ловит.
- Не проверено: настоящий релиз на GitHub (тег не пушился по указанию лида); `curl … raw.githubusercontent … | bash` — проверено запуском того же файла локально; `bun run dev -- --project` — ждёт реализации зоны project.
