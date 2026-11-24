#!/usr/bin/env bash
# Установка Live App Map в проект приложения. Запуск в корне проекта:
#   curl -fsSL https://raw.githubusercontent.com/inexbrand/live-app-map/master/install.sh | bash
#
# Что делает: клонирует Live App Map в $LAM_HOME (по умолчанию ~/.live-app-map) и ставит его зависимости,
# затем команда init (packages/cli/src/init.ts) в текущем проекте: bun add -d @live-app-map/sdk из
# последнего релиза sdk-v*, .live-app-map/config.ts и states.ts, map.json в .gitignore, скилл агента
# в .claude/skills/live-app-map. Повторный запуск обновляет клон и скилл, остальное не трогает.
#
# Переменные:
#   LAM_HOME         — куда клонировать Live App Map (по умолчанию ~/.live-app-map)
#   LAM_SDK_TARBALL  — URL или путь к live-app-map-sdk-<версия>.tgz вместо последнего релиза
#   LAM_REPO_URL     — откуда клонировать (по умолчанию https://github.com/inexbrand/live-app-map.git)
set -euo pipefail

LAM_HOME="${LAM_HOME:-$HOME/.live-app-map}"
LAM_REPO_URL="${LAM_REPO_URL:-https://github.com/inexbrand/live-app-map.git}"
PROJECT_DIR="$(pwd)"

fail() {
  echo "live-app-map: $1" >&2
  exit 1
}

command -v git >/dev/null 2>&1 || fail "нужен git"
command -v bun >/dev/null 2>&1 || fail "нужен bun: https://bun.sh (Windows: powershell -c \"irm bun.sh/install.ps1 | iex\")"
[ -f "$PROJECT_DIR/package.json" ] || fail "в $PROJECT_DIR нет package.json — запустите установку в корне проекта приложения"

if [ -d "$LAM_HOME/.git" ]; then
  echo "live-app-map: обновляю $LAM_HOME"
  git -C "$LAM_HOME" pull --ff-only --quiet || echo "live-app-map: git pull не прошёл (локальные правки?) — продолжаю с текущей версией" >&2
elif [ -e "$LAM_HOME" ]; then
  fail "$LAM_HOME есть, но это не клон git — удалите его или задайте другой LAM_HOME"
else
  echo "live-app-map: клонирую $LAM_REPO_URL в $LAM_HOME"
  git clone --depth 1 --quiet "$LAM_REPO_URL" "$LAM_HOME"
fi

echo "live-app-map: bun install в $LAM_HOME"
(cd "$LAM_HOME" && bun install --silent)

INIT_ARGS=(init --project "$PROJECT_DIR")
if [ -n "${LAM_SDK_TARBALL:-}" ]; then
  INIT_ARGS+=(--tarball "$LAM_SDK_TARBALL")
fi
bun run "$LAM_HOME/packages/cli/src/bin.ts" "${INIT_ARGS[@]}"
