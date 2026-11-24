# Что затронет

- packages/schema: types.ts, zod.ts (+ тест) — поля состояния; старые карты (name/inject) валидны.
- visualizer-spa: новые lib/project-states.ts, lib/state-nodes.ts, lib/stream/state-steps.ts; правки store/app (map-slice: index из развёрнутого документа, флаг showStates), live-url.ts (роль, lam_state), iframe-budget.ts (узлы из index.document), flow/AppMapCanvas + canvas-layout + pack-layout (ряд «экран + состояния»), stream-protocol/service/server/client/sync (steps, сообщение об ошибке шага), gateway snapshot-url/middleware/service (steps), PageNode (подпись ошибки, значок kind), SettingsSheet (переключатель «Состояния»).
- Не трогаю: packages/sdk (тиммейт sdk), эндпоинт /__lam_project (тиммейт project), korbor.
