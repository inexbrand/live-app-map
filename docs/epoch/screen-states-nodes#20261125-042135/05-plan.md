# План

1. Схема + zod + тест.
2. lib/state-nodes.ts (expand, merge, id) + тест; store: showStates, projectStates, index из развёрнутого документа.
3. live-url: роль и lam_state для узла-состояния + тест.
4. Раскладка: anchor в LayoutBox, ряд экрана + тест.
5. Шаги: lib/stream/state-steps.ts, StreamScreen.steps, StreamService, сообщение 'steps', клиент → store → подпись на узле + тест на Helium.
6. Снимок: steps в snapshotSrc/middleware/service + тест.
7. UI: переключатель «Состояния», значок kind, подпись «<экран> · <label>».
8. Клиент GET /__lam_project/states (после ответа project).
9. Живая проверка на 4431, скриншоты до/после.
