# `@live-app-map/export-appmap`

Мост между enterprise `AppMapDocument` / `LiveAppMapDocument` и zip-форматом `.appmap` (подмножество expo-map v2: `manifest.json` + `map.json` + `screens/`).

## Назначение

- **export** — упаковать `AppMapDocument` в bytes zip (`.appmap`)
- **parse** — распаковать zip (expo-map nodes/edges или liveappmap в `map.json`) в `LiveAppMapDocument` + бинарники screens
- **convert helpers** — re-export `appMapToLiveAppMap` / `liveAppMapToAppMap` из schema

Зависимости: `@live-app-map/schema`, `jszip`.

CLI-команда `live-app-map export` использует `exportAppMapZip` из этого пакета.

## Exports

Из `@live-app-map/export-appmap` (см. `src/index.ts`):

| Export | Тип | Описание |
|--------|-----|----------|
| `parseAppMapZip` | `(data) => Promise<AppMapZipParseResult>` | zip → live document + screens + warnings/errors |
| `exportAppMapZip` | `(doc: AppMapDocument) => Promise<Uint8Array>` | enterprise doc → zip bytes |
| `appMapToLiveAppMap` | re-export schema | enterprise → liveappmap |
| `liveAppMapToAppMap` | re-export schema | liveappmap → enterprise |
| `ExpoMapNode` | type | узел expo-map `map.json` |
| `ExpoMapEdge` | type | ребро expo-map |
| `ExpoMapJson` | type | `{ nodes?, edges? }` |
| `ExpoMapCapture` | type | `capture.screenshot` |
| `AppMapZipManifest` | type | поля `manifest.json` |
| `AppMapZipParseResult` | type | `{ ok: true, document, screens, warnings }` \| `{ ok: false, errors }` |

## Пример

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { parseAppMapDocument } from '@live-app-map/schema';
import {
  exportAppMapZip,
  parseAppMapZip,
} from '@live-app-map/export-appmap';

// enterprise JSON → .appmap
const raw = JSON.parse(readFileSync('maps/app.json', 'utf8')) as unknown;
const parsed = parseAppMapDocument(raw);
if (parsed.ok) {
  const zip = await exportAppMapZip(parsed.document);
  writeFileSync('maps/app.appmap', zip);
}

// .appmap → LiveAppMapDocument
const bytes = readFileSync('maps/app.appmap');
const result = await parseAppMapZip(bytes);
if (result.ok) {
  console.log(result.document.pages.length, result.warnings);
}
```

Через CLI monorepo:

```bash
bun run packages/cli/src/bin.ts export maps/korbor-miniapp.json -o maps/korbor-miniapp.appmap
```

## Verify

```bash
bun test packages/export-appmap
# или из пакета:
cd packages/export-appmap && bun test
```
