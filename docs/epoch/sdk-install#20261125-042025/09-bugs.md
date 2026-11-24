# Баги

- [closed] Повтор install.sh с локальным tarball заново делал bun add (путь Windows против прямых слешей в package.json) — 5acd289.
- [closed] bun install клона в длинном пути scratchpad падает ENAMETOOLONG — проверка перенесена в %TEMP%\lam-e2e; у пользователя ~/.live-app-map короткий.
- [closed, чужое] tsc сборки tarball падал на runtime/api.ts XMLHttpRequest — сообщено sdk, на текущем master сборка проходит.
