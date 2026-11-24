# Журнал

- dbdfe91 schema: поля LamScreenState в AppMapPageState + zod (name из id), page-state.test.ts.
- a5a23dd visualizer: lib/state-nodes, store (showStates, projectStates, stepErrors, index по развёрнутой карте), live-url, бюджет, холст, packLayout anchor.
- b753c24 stream: state-steps, StreamScreen.steps, StreamService, сообщение steps, клиент, набор трансляции; тест на Helium.
- 039ec60 snapshot: steps в адресе/разборе/ключе/съёмке; PageNode — шаги снимка, значок вида, ошибка шага; CSS.
- 12424a0 / 876fa78 / 3d79319 (auto-save общего checkout): project-states.ts + тест, useProjectStates в App, переключатель в SettingsSheet, тест MapToolbar, stepErrors не сбрасываются, русский текст таймаута, цвет ошибки.
- 7bfa437 тест store узлов-состояний.
- 835b7bb fix: итог шагов закрытой страницы не отправляется (ложная «page closed» на живой проверке).
