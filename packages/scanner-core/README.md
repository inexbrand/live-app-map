# `@live-app-map/scanner-core`

## Роль

Ядро сканеров Live App Map: обход FS, exclude, materialize dynamic params, сборка `AppMapDocument`, детект framework.
Framework-специфика — в `@live-app-map/scanner-next` и `@live-app-map/scanner-react-router`; CLI дергает их через это ядро.

## Публичный API

| Экспорт | Назначение |
|---------|------------|
| `walkFiles` | Рекурсивный walk (posix relative); FS-ошибки → `onFsError`, не silent empty |
| `isExcluded` | Проверка exclude-сегментов / globs |
| `materializePath` | Подстановка example-params в path pattern |
| `getExampleParam` | Чтение example (byRoute → top-level) |
| `extractDynamicParams` | Имена `[param]` / `[...slug]` / `[[...rest]]` |
| `humanTitle` | RU-заголовок маршрута для UI карты |
| `contentRevision` | Короткий sha256 revision документа |
| `assembleDocument` | Сборка `AppMapDocument` (formatVersion, nodes, edges) |
| `detectFramework` | `next` / `hybrid` / `react-router` / `unknown` |
| `diag`, `DEFAULT_EXCLUDE` | Диагностики + дефолтный exclude |
| `ScanRequest`, `ScanResult`, `ExampleParamsConfig`, … | Типы контракта скана |

## Пример

```ts
import {
  assembleDocument,
  detectFramework,
  materializePath,
  walkFiles,
} from '@live-app-map/scanner-core';

const root = '/path/to/app';
const framework = detectFramework(root);
const files = walkFiles(root, {
  exclude: ['node_modules', '.next'],
  onFsError: (info) => {
    console.warn(info.reason, info.relativePath);
  },
});

const { path: pathExample, missing } = materializePath('/users/[id]', {
  id: 'demo-user',
});

const document = assembleDocument({
  projectRoot: root,
  projectName: 'demo',
  framework,
  baseUrl: 'http://localhost:3000',
  nodes: [],
  edges: [],
  generatorName: '@live-app-map/scanner-core',
});

void files;
void pathExample;
void missing;
void document;
```

## Тесты

```bash
# из корня monorepo
bun test packages/scanner-core

# из каталога пакета
cd packages/scanner-core && bun test
```

Покрывает walk / exclude / materialize (`framework-walk.test.ts`, `materialize.test.ts`).
