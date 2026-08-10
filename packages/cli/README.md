# `@live-app-map/cli`

CLI и программный API Live App Map: сканирование Next.js / React Router, diff двух карт, doctor окружения, export в `.appmap`, hint для dev-sidecar.

## Назначение

- **bin** `live-app-map` — команды `scan`, `diff`, `doctor`, `export`, `dev`
- **API** — `runScan` / `runDiff` / `runDoctor` для CI и скриптов monorepo
- **config** — `defineConfig` для typed `live-app-map.config.ts`

Зависимости: `@live-app-map/scanner-*`, `@live-app-map/graph`, `@live-app-map/schema`, `@live-app-map/diagnostics`, `@live-app-map/export-appmap`.

## Exports

Из `@live-app-map/cli` (см. `src/index.ts`, `src/define-config.ts`):

| Export | Тип | Описание |
|--------|-----|----------|
| `runScan` | `(opts: ScanCliOptions) => Promise<ScanResult>` | авто-выбор scanner, опциональная запись JSON |
| `runDiff` | `(leftPath, rightPath) => AppMapDiff` | diff двух enterprise JSON |
| `runDoctor` | `(dir: string) => DoctorReport` | framework / app / pages / notes |
| `defineConfig` | `(config: LiveAppMapConfig) => LiveAppMapConfig` | identity + типы конфига |
| `formatDiagnostic` | re-export | из `@live-app-map/diagnostics` |
| `sortDiagnostics` | re-export | из `@live-app-map/diagnostics` |
| `ScanCliOptions` | type | `dir`, `baseUrl?`, `framework?`, `out?`, `format?`, … |
| `DoctorReport` | type | отчёт doctor |
| `LiveAppMapConfig` | type | поля конфига |
| `AppMapDocument` | type | re-export schema |

**bin** (package.json):

```text
live-app-map → ./src/bin.ts
```

### CLI-команды

```text
live-app-map scan --dir <path> [-o out.json] [--base-url url] [--framework next|react-router|auto] [--format enterprise|liveappmap]
live-app-map diff <left.json> <right.json>
live-app-map doctor [--dir <path>]
live-app-map export <appmap.json> -o map.appmap
live-app-map dev --target-url <url> [--port 4310] [--map <file.json>]
```

## Пример

### CLI (из корня monorepo)

```bash
bun run packages/cli/src/bin.ts scan --dir ../korbor/apps/miniapp --base-url http://localhost:5175 -o maps/out.json
bun run packages/cli/src/bin.ts doctor --dir ../korbor/apps/site
bun run packages/cli/src/bin.ts diff maps/a.json maps/b.json
```

### Программный API

```ts
import { runScan, defineConfig } from '@live-app-map/cli';

export default defineConfig({
  framework: 'next',
  baseUrl: 'http://localhost:3000',
  exampleParams: { id: 'demo' },
});

const result = await runScan({
  dir: './apps/web',
  baseUrl: 'http://localhost:3000',
  framework: 'auto',
  out: 'maps/web.json',
  format: 'enterprise',
});
```

## Verify

```bash
bun test packages/cli
# или из пакета:
cd packages/cli && bun test
```
