# 09 — Баги

Открытых багов этой задачи нет. Найденные старые проблемы вне задачи:

- [передано] 9 файлов visualizer-spa отсутствуют в git — делает другой агент (ветка `Resterr1337/visualizer-spa-task-fix`).
- [передано координатору] Холст высотой 0: у `.app-main` нет CSS-правил, `.canvas-wrap` схлопывается, React Flow пишет «parent container needs a width and a height». Воспроизводится на исходной карте `korbor-miniapp.liveappmap.json` без моих правок. Возможно, правила были в одном из отсутствующих файлов.
- [старое] `KORBOR_PRESETS missing id=korbor-all` в `store/korbor-all-hosts.test.ts`, расхождение `maps/` ↔ `public/maps` в `scripts/verify-korbor-maps.test.ts`.
- [исправлено, 987c446] У ноды сервиса панель замечаний показывала URL экрана.
