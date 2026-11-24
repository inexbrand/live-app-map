# План проверки (реальные вызовы)

1. `bun test packages/cli/src/init.test.ts` — init на временной папке: apps/*/vite.config, порт-литерал и пустой baseUrl, повторный запуск без дублей, .gitignore, скилл, реальный `bun add -d` локального tgz.
2. `bun run --cwd packages/sdk pack` → tgz; `tar -tzf` показывает dist/*.js, *.d.ts, package.json с exports на dist; установка tgz во временный проект и `import type` проходит tsc.
3. actionlint (docker) по .github/workflows/release-sdk.yml.
4. `LAM_SDK_TARBALL=<tgz> LAM_HOME=<врем> bash install.sh` в копии проекта (дважды) — файлы, package.json, .gitignore без дублей.
5. typecheck packages/cli и packages/sdk.
