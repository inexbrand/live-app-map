# `@live-app-map/plugin-api`

Контракты плагинов Live App Map: типы scanner/UI-плагина и `applyPlugins` для последовательного contribute/transform документа.

## Назначение

Авторы расширений описывают `LiveAppMapPlugin` (nodes/edges/transform/visualizer hooks).  
`applyPlugins` применяет contribute + transform **по порядку** массива; хук `visualizer` здесь **не** вызывается — его подключает SPA visualizer.

Зависимость: `@live-app-map/schema` (`AppMapDocument`, `AppMapNode`, `AppMapEdge`).

## Exports

Из `@live-app-map/plugin-api` (см. `src/index.ts`):

| Export | Тип | Описание |
|--------|-----|----------|
| `applyPlugins` | `(doc, plugins, ctx) => Promise<AppMapDocument>` | contributeNodes/Edges → transformDocument |
| `LiveAppMapPlugin` | type | `name`, `version?`, optional hooks |
| `ScanContext` | type | `projectRoot`, `appRoot`, `document` |
| `VisualizerPluginApi` | type | `addToolbarButton({ id, label, onClick })` |

### Хуки `LiveAppMapPlugin`

1. `contributeNodes?(ctx)` — доп. узлы  
2. `contributeEdges?(ctx)` — доп. рёбра  
3. `transformDocument?(doc, ctx)` — полная замена документа после contribute  
4. `visualizer?(api)` — UI toolbar (не в `applyPlugins`)

Пустой список плагинов → identity (тот же объект документа).

## Пример

```ts
import type { AppMapDocument } from '@live-app-map/schema';
import {
  applyPlugins,
  type LiveAppMapPlugin,
} from '@live-app-map/plugin-api';

const tagPlugin: LiveAppMapPlugin = {
  name: 'tag-all-pages',
  version: '0.1.0',
  transformDocument(doc) {
    return {
      ...doc,
      nodes: doc.nodes.map((n) =>
        n.kind === 'page'
          ? { ...n, tags: [...(n.tags ?? []), 'plugin'] }
          : n,
      ),
    };
  },
};

async function enrich(doc: AppMapDocument): Promise<AppMapDocument> {
  return applyPlugins(doc, [tagPlugin], {
    projectRoot: '/apps/web',
    appRoot: '/apps/web/app',
  });
}
```

## Verify

```bash
bun test packages/plugin-api
# или из пакета:
cd packages/plugin-api && bun test
```
