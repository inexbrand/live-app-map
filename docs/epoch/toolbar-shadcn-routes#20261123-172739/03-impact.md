# Влияние

- `packages/graph`: новый `api-domains.ts` (экспорт из `index.ts`). `apiArchitecture` не тронут — им пользуется MCP (`packages/mcp-server/src/code-tools.ts`).
- `apps/visualizer-spa`: шапка, листы «Настройки» и «Входы», панель экрана, вид «API», все компоненты со старым kit; удалены `src/ui`, `Breadcrumbs`, `DiagnosticsDock`, `ThemeToggle`; из стора убраны `diagnosticsOpen`, `logFilterPageId`.
- `styles/global.css`: сброс кнопок перенесён в `@layer base` — иначе правило без слоя перебивало утилиты Tailwind.
- korbor (`C:\work\korbor`): `scripts/dev.ts --without=bot,call` (коммит d06ccdac в inexbrand/korbor).
- Тесты DOM: проверки классов `ui-*` и нативного `<select>` заменены на роли, `aria-pressed`, `data-slot`, `data-value`.
