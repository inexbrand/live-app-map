# План тестов

## Unit

- что вызываем (реальный entry): `checkProjectConfig`, `loadProjectConfig` (настоящий config.ts в tmp), `exampleParamsFor`,
  `withRoleStates`, `withPayloadPages`, `cmsPagesOf`, `fetchCmsPages` (живой Bun.serve), `mergeSurfaces`, `projectDocument`,
  `attachProjectCode` (фикстура source-monorepo), `scanProject` и `runCli(['scan','--project'])` на проекте из фикстур;
  `openProject`, `projectMiddleware`, `mapsIndexMiddleware` (настоящий node:http), перечитывание states.ts по mtime;
  `monorepoScanRecipes`, `mapVersionsMiddleware` с картой вне папки; `parseDevArgs`.
- что не мокаем: файловую систему, импорт Bun, HTTP, git.

## E2E / frontend

- пользовательский путь: dev с `--project ../korbor` → каталог → карта проекта на холсте.
- реальный API/UI: headless Helium на :4411.

## Реальные вызовы

- `bun run scan -- --project ../korbor`
- `curl :4411/maps/index.json`, `/__lam_project/states`, `/__lam_project/map.json`
