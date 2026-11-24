# Ресерч

Как устроено сейчас:
- Схема: `packages/schema/src/types.ts` AppMapPageState {name, url, screenshot, note, inject{query,hash,role,…}}; zod `appMapPageStateSchema` (passthrough). Состояния сейчас — чипы на ноде (flow/page-node/StateChips.tsx) и в FocusBar; выбранное — `activeStates` в store, адрес — `store/app/live-url.ts` (urlWithState: роль → lam_role, query, hash).
- Профиль шлюза: `lib/gateway/profile-pick.ts` pickNodeProfile — по имени активного стейта как роли.
- Холст: `flow/AppMapCanvas.tsx` → filterCanvasGraph(document) → layoutCanvas → packLayout (группы, связные куски dagre/полки, MAX_ROW_WIDTH 4200).
- Набор трансляции: `lib/stream/stream-sync.ts` screensOf (mountedPageIds × resolveLiveUrl) → WebSocket → `stream-server.ts` → `StreamService.sync` (planSync: open/navigate/resize/live). Готовность кадра: событие load → settleLoaded (page-settle.ts) → readyAt + captureScreenshot.
- Снимок шлюза: PageNode → snapshotSrc(url,w,h) → `/__lam_snapshot` → SnapshotService.shoot (goto load → settleLoaded → screenshot), ключ файла sha1(url|w|h).
- Бюджет живых: store/app/iframe-budget.ts строит доступность по `s.document.nodes`.

## Покрытие

| Нужно | Есть | Нет |
|---|---|---|
| Поля LamScreenState в схеме | name/inject | id, kind, label, role, api, steps |
| Источник states.ts | — | клиент GET /__lam_project/states + слияние |
| Узлы-состояния | только чипы-переключатели на одной ноде | отдельные узлы рядом, переключатель вида |
| lam_state в адресе | lam_role | lam_state |
| Шаги в трансляции | — | выполнение после settle, ошибка шага на узле |
| Шаги в снимке | — | steps в запросе снимка и в ключе файла |
| Раскладка | packLayout по группам | экран+состояния одним рядом |
