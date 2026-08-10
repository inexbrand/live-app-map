# `@live-app-map/next`

Интеграция Live App Map с Next.js: обёртка `next.config` (`withLiveAppMap`) и re-export React UI (`LiveAppMap`, `LiveAppMapDevtools`).

## Назначение

В dev (по умолчанию) добавляет rewrite `/__live-app-map/*` → sidecar visualizer (`http://127.0.0.1:4310`) и env `LIVE_APP_MAP_ENABLED=1`.  
Identity rewrite (source === destination) запрещён без явного `allowIdentityRewrite: true`.

Peer: `next` ≥14, `react` ^19.  
Зависимости: `@live-app-map/react`, `@live-app-map/schema`.

## Exports

Из `@live-app-map/next` (см. `src/index.ts`):

| Export | Тип | Описание |
|--------|-----|----------|
| `withLiveAppMap` | `(options?) => (nextConfig) => config` | обёртка next.config |
| `LiveAppMap` | re-export | из `@live-app-map/react` |
| `LiveAppMapDevtools` | re-export | из `@live-app-map/react` |
| `LiveAppMapNextOptions` | type | `enabled?`, `allowProduction?`, `routePrefix?`, `sidecarBaseUrl?`, `allowIdentityRewrite?` |
| `NextRewriteRule` | type | `{ source, destination }` |
| `NextRewritePhases` | type | `beforeFiles` / `afterFiles` / `fallback` |
| `NextRewritesResult` | type | массив правил или фазы |
| `LiveAppMapWrappedConfig` | type | config + `rewrites` + `env` |

### Опции `withLiveAppMap` (defaults)

| Опция | Default |
|-------|---------|
| `enabled` | `NODE_ENV !== 'production'` |
| `allowProduction` | `false` |
| `routePrefix` | `/__live-app-map` |
| `sidecarBaseUrl` | `http://127.0.0.1:4310` |
| `allowIdentityRewrite` | `false` |

## Пример

```ts
// next.config.ts
import { withLiveAppMap } from '@live-app-map/next';

export default withLiveAppMap({
  sidecarBaseUrl: 'http://127.0.0.1:4310',
})({
  // ваш next config
});
```

```tsx
// layout / dev-only shell
import { LiveAppMapDevtools } from '@live-app-map/next';

export function DevMapShell() {
  return <LiveAppMapDevtools />;
}
```

Sidecar visualizer monorepo:

```bash
bun run dev:visualizer
# http://localhost:4310
```

## Verify

```bash
bun test packages/next
# или из пакета:
cd packages/next && bun test
```
