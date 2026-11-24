# План тестов (реальные функции)

- schema: parseAppMapDocument с состоянием {id,label,kind,role,api,steps} без name — ok, name = id; старое {name,inject} — ok; неверный шаг — ошибка.
- state-nodes: expandStateNodes на документе с экраном и 2 состояниями → 2 новых узла с id/title/группой; showStates=false → без них; mergeProjectStates: states.ts заменяет одноимённое состояние карты.
- live-url: resolveLiveUrl для узла-состояния содержит lam_state=<экран>/<состояние> и lam_role роли состояния.
- pack-layout: узлы с anchor ставятся в тот же ряд справа от экрана, без наложений; korbor-карта до/после — высота раскладки.
- stream-service (настоящий headless Helium, Bun.serve, путь не /slow): экран со steps [click #open] → первый кадр с открытой модалкой (пиксели JPEG); шаг с несуществующим селектором → сообщение «шаг 1 не выполнен», кадр всё равно есть.
- snapshot-service: steps в запросе → снимок после шагов; ключ файла различается по steps.
- живое: свой vite на 4431, карта korbor, headless Helium: data-lam-url узла-состояния с lam_state, кадр модалки.
