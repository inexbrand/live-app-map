# Research

## Чего нет (по tsc и vite)

| Модуль | Кто импортирует | Что ждут |
|---|---|---|
| `src/lib/map-catalog` | App, MapToolbar | `fetchMapCatalog()` → `{ok, catalog:{maps}}` / `{ok:false,error}`; `MapCatalogEntry {id,label,path,baseUrl,pageCount}` |
| `src/lib/build-map-catalog-fs` | vite.config | `writeMapCatalogIndex(dir)` → каталог (и файл `index.json`) из `*.liveappmap.json` |
| `src/lib/load-map-preset` | App, MapToolbar | `loadMapPresetIntoStore(entry, {setBaseUrlOverride, loadUnknownJson, setMode})` → `{ok}`/`{ok:false,error}` |
| `src/lib/measure-iframe-height` | PageNode | `measureIframeContentHeight(iframe)` → `number \| null` (same-origin) |
| `src/components/LamGrabHost` | App (вне холста) | без props |
| `src/components/SnapshotOverlay` | App (внутри холста) | без props |
| `src/lib/error-reports-middleware` | vite.config | connect-middleware, «POST /api/error-reports — client ErrorBoundary → SMTP» |
| `src/lib/agent-state-middleware` | vite.config | connect-middleware |
| `src/lib/mcp-middleware` | vite.config (`mcpAgentMiddleware`) | connect-middleware |

## Прочие причины красного typecheck

- `schema/convert.ts`: viewport viewer-формата без height → `DeviceViewport` (height обязателен); типы viewport не экспортированы из `index.ts`.
- `mcp-server/server.ts`: `for await` по `ReadableStream`.
- SPA: `AppMapCanvas` зовёт старую сигнатуру `resolveNodeViewport(a, b)`; `vite.config` — `router` нет в типе `ProxyOptions`.
- Тесты SPA: документ старой формы (`schemaVersion`), пресет `korbor-all` вместо `all`, литеральные типы `as const`.
- e2e `import-clear`: ждёт старый UI (заголовок «Live App Map», `footer.status-bar`, кнопка «Очистить»).

## Покрытие (что система должна уметь)

| Нужно | Было | Делаю |
|---|---|---|
| каталог карт из `public/maps` без хардкода продукта | нет | build-map-catalog-fs + map-catalog |
| пресеты Korbor с baseUrl dev-серверов | `korbor-presets.ts` (только 4 карты) | каталог берёт baseUrl из карты, label/baseUrl Korbor — из пресетов |
| auto-высота iframe | нет | measure-iframe-height |
| снимок экрана для фидбэка (с iframe) | рисунок-заглушка в FeedbackPanel | Screen Capture API текущей вкладки + выделение области |
| агент видит, что открыто в визуализаторе | нет | agent-state + MCP tool |
| MCP по HTTP от dev-сервера | только stdio | mcp-middleware на общем ядре mcp-server |
| отчёты об ошибках клиента | нет | ErrorBoundary + window.onerror → middleware → JSONL |
