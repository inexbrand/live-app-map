---
name: project-folder-map
description: карта korbor живёт в korbor/.live-app-map/map.json (не в git); тесты — срезы test-fixtures/maps; states.ts перечитывать импортом пути с ?v=
metadata:
  node_type: memory
  type: project
  originSessionId: 71d01c9e-4924-435d-8fae-1e6f9ae2e835
  modified: 2026-11-24T23:51:01.375Z
---

С 2026-11-25 карт korbor в live-app-map нет: `maps/korbor-*` и `public/maps/korbor-*` удалены. Карта —
`korbor/.live-app-map/map.json` (в .gitignore korbor), пишет `bun run scan -- --project ../korbor`;
визуализатор — `bun run dev -- --project ../korbor` (LAM_PROJECT), карта в каталоге под id `korbor`,
адрес `/__lam_project/map.json`. Сравнение «коммит git» для неё пусто — map.json не в git.
Unit-тесты и mcp-server читают срезы `test-fixtures/maps/korbor-*.liveappmap.json` (не `fixtures/`: снимок
scanner-source обходит все её подпапки). e2e берут карту проекта (playwright ставит LAM_PROJECT=../korbor).

Bun: `import(fileUrl + '?v=N')` модуль НЕ перечитывает (кэш по пути без запроса), `import(absPath + '?v=N')` —
перечитывает. Так `/__lam_project/states` видит правку states.ts без перезапуска.

**Why:** без этого ищут карты в maps/ и правят states.ts «без эффекта».
**How to apply:** новая проверка на карте korbor — срез из test-fixtures/maps или живой скан; динамический
импорт пользовательского TS в dev-сервере — путь с ?v=<mtime>. См. [[scan-korbor-needs-live-cms]], [[shared-checkout-no-stash]].
